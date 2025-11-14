const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));
app.use('/previews', express.static('previews'));

// Ensure directories exist
const downloadsDir = path.join(__dirname, 'downloads');
const previewsDir = path.join(__dirname, 'previews');
fs.ensureDirSync(downloadsDir);
fs.ensureDirSync(previewsDir);

// Utility function to extract TikTok video ID from URL
function extractVideoId(url) {
  const patterns = [
    /tiktok\.com\/@[\w.-]+\/video\/(\d+)/,
    /vt\.tiktok\.com\/(\w+)/,
    /vm\.tiktok\.com\/(\w+)/,
    /tiktok\.com\/t\/(\w+)\//
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Function to get TikTok video data and download link
async function getTikTokVideoData(videoUrl) {
  try {
    console.log('Fetching video data from:', videoUrl);
    
    // Using tikwm API for comprehensive data
    const response = await axios.get(`https://tikwm.com/api/`, {
      params: {
        url: videoUrl,
        count: 12,
        cursor: 0,
        web: 1,
        hd: 1
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://tikwm.com',
        'Referer': 'https://tikwm.com/'
      }
    });

    if (response.data && response.data.data) {
      const data = response.data.data;
      return {
        success: true,
        downloadUrl: data.play ? `https://tikwm.com${data.play}` : null,
        videoData: {
          id: data.id,
          title: data.title,
          description: data.title,
          duration: data.duration,
          cover: data.cover,
          author: {
            nickname: data.author?.nickname || 'Unknown',
            unique_id: data.author?.unique_id || 'unknown',
            avatar: data.author?.avatar
          },
          music: {
            title: data.music_info?.title || 'Original Sound',
            author: data.music_info?.author || 'Unknown',
            play: data.music_info?.play_url || data.music || null
          },
          statistics: {
            play_count: data.play_count,
            digg_count: data.digg_count,
            comment_count: data.comment_count,
            share_count: data.share_count
          },
          hashtags: extractHashtags(data.title)
        }
      };
    }
    
    return { success: false, error: 'No data received from API' };
  } catch (error) {
    console.log('TikTok API failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Extract hashtags from title/description
function extractHashtags(text) {
  if (!text) return [];
  const hashtags = text.match(/#[\w\u4e00-\u9fff]+/g) || [];
  return hashtags.map(tag => tag.replace('#', ''));
}

// Download video and create preview
async function downloadVideo(downloadUrl, filename) {
  try {
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://tiktok.com/'
      }
    });

    const filePath = path.join(downloadsDir, filename);
    const writer = fs.createWriteStream(filePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(filePath));
      writer.on('error', reject);
    });
  } catch (error) {
    throw new Error(`Download failed: ${error.message}`);
  }
}

// Routes

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get video info and metadata
app.post('/api/info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'TikTok URL is required'
      });
    }

    console.log('Fetching info for URL:', url);

    const result = await getTikTokVideoData(url);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      downloadUrl: result.downloadUrl,
      videoData: result.videoData
    });

  } catch (error) {
    console.error('Info error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Download video and return blob
app.post('/api/download', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'TikTok URL is required'
      });
    }

    console.log('Processing download for URL:', url);

    const result = await getTikTokVideoData(url);

    if (!result.success || !result.downloadUrl) {
      return res.status(404).json({
        success: false,
        error: 'Could not get download link'
      });
    }

    // Generate filename
    const filename = `tiktok_${result.videoData.id}_${Date.now()}.mp4`;
    
    // Download the video
    const filePath = await downloadVideo(result.downloadUrl, filename);

    // Read file as buffer for blob
    const videoBuffer = await fs.readFile(filePath);

    // Send response with video data and blob info
    res.json({
      success: true,
      videoData: result.videoData,
      downloadInfo: {
        filename: filename,
        size: videoBuffer.length,
        blobUrl: `/api/blob/${filename}`,
        directUrl: result.downloadUrl
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve video as blob
app.get('/api/blob/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(downloadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Send entire file
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${filename}"`
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('Blob serving error:', error);
    res.status(500).json({
      success: false,
      error: 'Error serving video file'
    });
  }
});

// Cleanup endpoint (optional)
app.delete('/api/cleanup', async (req, res) => {
  try {
    const files = await fs.readdir(downloadsDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const file of files) {
      const filePath = path.join(downloadsDir, file);
      const stat = await fs.stat(filePath);
      
      if (now - stat.mtime.getTime() > maxAge) {
        await fs.unlink(filePath);
        console.log('Deleted old file:', file);
      }
    }

    res.json({
      success: true,
      message: 'Cleanup completed'
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'TikTok Downloader API',
    version: '1.1.0'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Enhanced TikTok Downloader running on http://localhost:${PORT}`);
  console.log(`📱 Endpoints:`);
  console.log(`   POST /api/info - Get video info and metadata`);
  console.log(`   POST /api/download - Download video with full data`);
  console.log(`   GET  /api/blob/:filename - Get video as blob`);
  console.log(`   GET  / - Web interface`);
});
