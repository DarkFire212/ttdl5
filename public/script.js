let currentVideoData = null;
let currentBlobUrl = null;

document.addEventListener('DOMContentLoaded', function() {
    const getInfoBtn = document.getElementById('getInfoBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const tiktokUrl = document.getElementById('tiktokUrl');
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');
    const videoPreview = document.getElementById('videoPreview');
    const videoPlayer = document.getElementById('videoPlayer');
    const videoInfo = document.getElementById('videoInfo');
    
    getInfoBtn.addEventListener('click', async function() {
        const url = tiktokUrl.value.trim();
        
        if (!url) {
            showResult('Please enter a TikTok URL', 'error');
            return;
        }
        
        if (!url.includes('tiktok.com') && !url.includes('vm.tiktok.com') && !url.includes('vt.tiktok.com')) {
            showResult('Please enter a valid TikTok URL', 'error');
            return;
        }
        
        loading.style.display = 'block';
        videoPreview.style.display = 'none';
        downloadBtn.style.display = 'none';
        result.style.display = 'none';
        getInfoBtn.disabled = true;
        
        try {
            const response = await fetch('/api/info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: url })
            });
            
            const data = await response.json();
            
            if (data.success) {
                currentVideoData = data.videoData;
                showVideoPreview(data);
                downloadBtn.style.display = 'block';
            } else {
                showResult(`❌ Error: ${data.error}`, 'error');
            }
        } catch (error) {
            showResult(`❌ Network error: ${error.message}`, 'error');
        } finally {
            loading.style.display = 'none';
            getInfoBtn.disabled = false;
        }
    });
    
    downloadBtn.addEventListener('click', async function() {
        if (!currentVideoData) return;
        
        loading.style.display = 'block';
        downloadBtn.disabled = true;
        
        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: tiktokUrl.value.trim() })
            });
            
            const data = await response.json();
            
            if (data.success) {
                const downloadLink = document.createElement('a');
                downloadLink.href = data.downloadInfo.blobUrl;
                downloadLink.download = `tiktok_${currentVideoData.author.unique_id}_${currentVideoData.id}.mp4`;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                
                showResult('✅ Video downloaded successfully!', 'success');
            } else {
                showResult(`❌ Download error: ${data.error}`, 'error');
            }
        } catch (error) {
            showResult(`❌ Download failed: ${error.message}`, 'error');
        } finally {
            loading.style.display = 'none';
            downloadBtn.disabled = false;
        }
    });
    
    function showVideoPreview(data) {
        const videoData = data.videoData;
        
        videoPlayer.src = data.downloadUrl;
        
        // Generate avatar HTML with fallback handling
        const avatarHtml = generateAvatarHtml(videoData.author);
        
        videoInfo.innerHTML = `
            <div class="flex items-center mb-6">
                ${avatarHtml}
                <div>
                    <h3 class="text-lg font-semibold text-gray-100">${videoData.author.nickname}</h3>
                    <p class="text-sm text-gray-300">@${videoData.author.unique_id}</p>
                </div>
            </div>
            
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div class="text-center p-4 bg-black/30 rounded-xl shadow">
                    <span class="block text-2xl font-bold text-primary">${formatNumber(videoData.statistics.play_count)}</span>
                    <span class="text-xs uppercase text-gray-500 tracking-wider">Plays</span>
                </div>
                <div class="text-center p-4 bg-black/30 rounded-xl shadow">
                    <span class="block text-2xl font-bold text-primary">${formatNumber(videoData.statistics.digg_count)}</span>
                    <span class="text-xs uppercase text-gray-500 tracking-wider">Likes</span>
                </div>
                <div class="text-center p-4 bg-black/30 rounded-xl shadow">
                    <span class="block text-2xl font-bold text-primary">${formatNumber(videoData.statistics.comment_count)}</span>
                    <span class="text-xs uppercase text-gray-500 tracking-wider">Comments</span>
                </div>
                <div class="text-center p-4 bg-black/30 rounded-xl shadow">
                    <span class="block text-2xl font-bold text-primary">${formatNumber(videoData.statistics.share_count)}</span>
                    <span class="text-xs uppercase text-gray-500 tracking-wider">Shares</span>
                </div>
            </div>
            
            ${videoData.music ? `
            <div class="flex items-center bg-black/30 p-4 rounded-xl mb-6 shadow">
                <div class="text-2xl mr-3 text-primary"><i class="fas fa-music text-slate-200"></i></div>
                <div>
                    <h4 class="font-semibold text-gray-100">${videoData.music.title}</h4>
                    <p class="text-sm text-gray-400">by ${videoData.music.author}</p>
                </div>
            </div>
            ` : ''}
            
            ${videoData.hashtags.length > 0 ? `
            <div class="flex flex-wrap gap-2 mb-6">
                ${videoData.hashtags.map(tag =>
                `<span class="px-3 py-1 text-xs font-medium text-white rounded-full bg-white/10">#${tag}</span>`
                ).join('')}
            </div>
            ` : ''}
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <button onclick="downloadVideo()" class="py-4 px-6 w-full text-white font-semibold text-base rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold shadow-md hover:translate-y-[-2px] hover:shadow-lg transition-all">Download MP4</button>
                <button onclick="playInNewTab()" class="py-4 px-6 w-full text-white font-semibold text-base rounded-xl bg-gradient-to-br from-gray-600 to-gray-800 shadow-md hover:translate-y-[-2px] hover:shadow-lg transition-all">Open in New Tab</button>
            </div>
        `;
        
        videoPreview.style.display = 'block';
    }
    
    function generateAvatarHtml(author) {
        const avatarUrl = author.avatar;
        const nickname = author.nickname || 'TT';
        const initials = getInitials(nickname);
        const avatarColor = getAvatarColor(nickname);
        
        if (avatarUrl) {
            // Use actual avatar with fallback to colored avatar
            return `
                <div class="relative mr-4">
                    <img src="${avatarUrl}" 
                         alt="${nickname}" 
                         class="w-12 h-12 rounded-full border-4 border-primary object-cover"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="w-12 h-12 rounded-full border-4 border-primary flex items-center justify-center text-white font-bold text-lg ${avatarColor} hidden">
                        ${initials}
                    </div>
                </div>
            `;
        } else {
            // Use colored avatar directly
            return `
                <div class="w-12 h-12 rounded-full border-4 border-primary flex items-center justify-center text-white font-bold text-lg mr-4 ${avatarColor}">
                    ${initials}
                </div>
            `;
        }
    }
    
    function getInitials(username) {
        // Get first letter of username, fallback to 'TT'
        if (!username || username === 'Unknown User') return 'TT';
        return username.charAt(0).toUpperCase();
    }
    
    function getAvatarColor(username) {
        const colors = [
            'bg-gradient-to-br from-pink-500 to-rose-500',
            'bg-gradient-to-br from-cyan-500 to-blue-500',
            'bg-gradient-to-br from-purple-500 to-indigo-500',
            'bg-gradient-to-br from-green-500 to-emerald-500',
            'bg-gradient-to-br from-orange-500 to-red-500',
            'bg-gradient-to-br from-teal-500 to-cyan-500',
            'bg-gradient-to-br from-violet-500 to-purple-500',
            'bg-gradient-to-br from-amber-500 to-orange-500'
        ];
        
        // Generate consistent color based on username
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    }
    
    function formatNumber(num) {
        if (!num) return '0';
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
    
    function showResult(message, type) {
        result.innerHTML = message;
        result.className = `result ${type}`;
        result.style.display = 'block';
    }
    
    window.downloadVideo = function() {
        downloadBtn.click();
    };
    
    window.playInNewTab = function() {
        if (currentVideoData) {
            window.open(videoPlayer.src, '_blank');
        }
    };
    
    tiktokUrl.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            getInfoBtn.click();
        }
    });
});
