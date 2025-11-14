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

// Ensure directories exist
const downloadsDir = path.join(__dirname, 'downloads');
const publicDir = path.join(__dirname, 'public');
fs.ensureDirSync(downloadsDir);
fs.ensureDirSync(publicDir);

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
    
    // Try multiple APIs for better data
    const result = await tryMultipleAPIs(videoUrl);
    
    if (result.success) {
      return result;
    }
    
    return { success: false, error: 'All APIs failed to fetch data' };
  } catch (error) {
    console.log('TikTok API failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Try multiple TikTok APIs
async function tryMultipleAPIs(videoUrl) {
  // Method 1: Using tikwm API
  try {
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
      },
      timeout: 10000
    });

    if (response.data && response.data.data) {
      const data = response.data.data;
      return {
        success: true,
        downloadUrl: data.play ? `https://tikwm.com${data.play}` : null,
        videoData: processVideoData(data)
      };
    }
  } catch (error) {
    console.log('Tikwm API failed:', error.message);
  }

  // Method 2: Try alternative API (tikcdn.net)
  try {
    const videoId = extractVideoId(videoUrl);
    if (videoId) {
      // Try to get user info from TikTok directly
      const userData = await getUserInfoFromUrl(videoUrl);
      return {
        success: true,
        downloadUrl: `https://tikcdn.net/api/v1/video/${videoId}`,
        videoData: userData
      };
    }
  } catch (error) {
    console.log('Alternative API failed:', error.message);
  }

  throw new Error('All APIs failed');
}

// Process and normalize video data
function processVideoData(data) {
  // Fix avatar URL if it's relative or has issues
  let avatarUrl = data.author?.avatar;
  
  if (avatarUrl) {
    // If it's a relative URL, make it absolute
    if (avatarUrl.startsWith('//')) {
      avatarUrl = 'https:' + avatarUrl;
    } else if (avatarUrl.startsWith('/')) {
      avatarUrl = 'https://tikwm.com' + avatarUrl;
    }
    
    // Ensure it's a valid URL
    if (!avatarUrl.startsWith('http')) {
      avatarUrl = null;
    }
  }

  return {
    id: data.id,
    title: data.title,
    description: data.title,
    duration: data.duration,
    cover: data.cover,
    author: {
      nickname: data.author?.nickname || 'Unknown User',
      unique_id: data.author?.unique_id || 'unknown',
      avatar: avatarUrl,
      // Generate a colorful fallback avatar based on username
      fallback_avatar: generateFallbackAvatar(data.author?.nickname || 'TT')
    },
    music: {
      title: data.music_info?.title || 'Original Sound',
      author: data.music_info?.author || 'Unknown Artist',
      play: data.music_info?.play_url || data.music || null
    },
    statistics: {
      play_count: data.play_count || 0,
      digg_count: data.digg_count || 0,
      comment_count: data.comment_count || 0,
      share_count: data.share_count || 0
    },
    hashtags: extractHashtags(data.title)
  };
}

// Generate a fallback avatar with initials and color
function generateFallbackAvatar(username) {
  const initials = username.charAt(0).toUpperCase();
  const colors = [
    '#ff0050', '#00f2ea', '#667eea', '#764ba2', 
    '#f093fb', '#f5576c', '#4facfe', '#00f2fe'
  ];
  const color = colors[username.length % colors.length];
  
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="${color}" rx="50"/><text x="50" y="60" text-anchor="middle" fill="white" font-size="40" font-family="Arial, sans-serif">${initials}</text></svg>`;
}

// Try to get user info from the URL
async function getUserInfoFromUrl(videoUrl) {
  try {
    const response = await axios.get(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 5000
    });

    const $ = cheerio.load(response.data);
    
    // Try to extract user info from meta tags
    const username = $('meta[property="og:title"]').attr('content') || 'TikTok User';
    const description = $('meta[property="og:description"]').attr('content') || '';
    
    return {
      id: 'unknown',
      title: description.split('\n')[0] || 'TikTok Video',
      description: description,
      author: {
        nickname: username.replace(/ on TikTok$/, ''),
        unique_id: 'tiktokuser',
        avatar: null,
        fallback_avatar: generateFallbackAvatar(username)
      },
      music: {
        title: 'Original Sound',
        author: 'Unknown'
      },
      statistics: {
        play_count: 0,
        digg_count: 0,
        comment_count: 0,
        share_count: 0
      },
      hashtags: extractHashtags(description)
    };
  } catch (error) {
    // Return default data if scraping fails
    return getDefaultVideoData();
  }
}

// Get default video data when all else fails
function getDefaultVideoData() {
  return {
    id: Date.now().toString(),
    title: 'TikTok Video',
    description: 'Downloaded from TikTok',
    author: {
      nickname: 'TikTok User',
      unique_id: 'tiktokuser',
      avatar: null,
      fallback_avatar: generateFallbackAvatar('TT')
    },
    music: {
      title: 'Original Sound',
      author: 'Unknown Artist'
    },
    statistics: {
      play_count: 0,
      digg_count: 0,
      comment_count: 0,
      share_count: 0
    },
    hashtags: ['tiktok', 'video']
  };
}

// Extract hashtags from title/description
function extractHashtags(text) {
  if (!text) return ['tiktok'];
  const hashtags = text.match(/#[\w\u4e00-\u9fff]+/g) || [];
  const cleaned = hashtags.map(tag => tag.replace('#', '')).slice(0, 10); // Limit to 10 hashtags
  return cleaned.length > 0 ? cleaned : ['tiktok'];
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
      },
      timeout: 30000
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

// API Routes

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'TikTok Downloader API',
    version: '2.1.0'
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
  console.log(`🚀 TikTok Downloader running on http://localhost:${PORT}`);
  console.log(`📱 Open your browser and navigate to the above URL`);
});
