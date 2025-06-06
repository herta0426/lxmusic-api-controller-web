import React, { useEffect, useRef, useState } from "react";

const DEFAULT_API_URL = "http://127.0.0.1:23330";

function parseLRC(lrcText: string) {
  const lines = lrcText.split('\n');
  const result: { time: number, text: string }[] = [];
  const timeReg = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;
  for (const line of lines) {
    let match;
    const text = line.replace(timeReg, '').trim();
    if (!text) continue;
    while ((match = timeReg.exec(line))) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0;
      const time = min * 60 + sec + ms / 1000;
      result.push({ time, text });
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

function getStatusText(status: string) {
  switch (status) {
    case 'playing': return '播放中';
    case 'paused': return '已暂停';
    case 'error': return '错误';
    case 'stoped': return '已停止';
    default: return status;
  }
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('lx_api_url') || DEFAULT_API_URL);
  const [showSidebar, setShowSidebar] = useState(false);
  const [player, setPlayer] = useState<any>(null);
  const [lrcLines, setLrcLines] = useState<{ time: number, text: string }[]>([]);
  const [lastSongId, setLastSongId] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [volume, setVolume] = useState(100);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progressTimer, setProgressTimer] = useState<NodeJS.Timeout | null>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [sidebarPanel, setSidebarPanel] = useState<'api' | 'ui' | 'about'>('api');
  const [blurEnabled, setBlurEnabled] = useState(() => {
    const val = localStorage.getItem('lx_blur_enabled');
    return val === null ? true : val === 'true';
  });

  // 切换模糊
  useEffect(() => {
    if (blurEnabled) {
      document.body.classList.remove('no-blur');
      localStorage.setItem('lx_blur_enabled', 'true');
    } else {
      document.body.classList.add('no-blur');
      localStorage.setItem('lx_blur_enabled', 'false');
    }
  }, [blurEnabled]);

  // 侧边栏保存API
  const handleSaveApiUrl = () => {
    if (!/^https?:\/\/.+:\d+$/.test(apiUrl)) {
      alert('请输入正确的API地址（如 http://192.168.1.100:23330）');
      return;
    }
    localStorage.setItem('lx_api_url', apiUrl);
    window.location.reload();
  };

  // 获取完整歌词
  const fetchFullLyric = async () => {
    try {
      const res = await fetch(`${apiUrl}/lyric`);
      if (res.ok) {
        const lrc = await res.text();
        setLrcLines(parseLRC(lrc));
      } else {
        setLrcLines([]);
      }
    } catch {
      setLrcLines([]);
    }
  };

  // 更新歌词高亮
  useEffect(() => {
    if (!player || !lrcLines.length) return;
    let idx = -1;
    for (let i = 0; i < lrcLines.length; i++) {
      if ((player.progress || 0) >= lrcLines[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    setActiveIdx(idx);
    // 自动滚动
    if (autoScroll && lyricsRef.current && idx !== -1) {
      const lines = lyricsRef.current.querySelectorAll('.lyrics-line');
      if (lines[idx]) {
        const containerHeight = lyricsRef.current.clientHeight;
        const lineHeight = (lines[idx] as HTMLElement).offsetHeight;
        const scrollTop = (lines[idx] as HTMLElement).offsetTop - containerHeight / 2 + lineHeight / 2;
        lyricsRef.current.scrollTo({ top: scrollTop, behavior: 'smooth' });
      }
    }
  }, [player?.progress, lrcLines, autoScroll]);

  // 进度条自动推进
  useEffect(() => {
    if (progressTimer) clearInterval(progressTimer);
    if (player?.status === 'playing' && typeof player.progress === 'number' && typeof player.duration === 'number') {
      const timer = setInterval(() => {
        setProgress(p => {
          if (p + 1 > player.duration) {
            clearInterval(timer);
            return player.duration;
          }
          return p + 1;
        });
      }, 1000);
      setProgressTimer(timer);
      return () => clearInterval(timer);
    }
    // eslint-disable-next-line
  }, [player?.status, player?.progress, player?.duration]);

  // 进度/时长同步
  useEffect(() => {
    setProgress(player?.progress || 0);
    setDuration(player?.duration || 0);
  }, [player?.progress, player?.duration]);

  // 歌曲变化时刷新歌词（SSE返回音乐切换时立即请求LRC）
  useEffect(() => {
    if (!player) return;
    const songId = (player.name || '') + '|' + (player.singer || '');
    if (songId !== lastSongId) {
      setLastSongId(songId);
      // 立即拉取完整LRC歌词
      fetchFullLyric();
    }
    // eslint-disable-next-line
  }, [player?.name, player?.singer]);

  // SSE订阅
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let sseStatus: any = {};
    const fields = [
      'status', 'name', 'singer', 'albumName', 'duration', 'progress', 'playbackRate',
      'picUrl', 'lyricLineText', 'lyricLineAllText', 'lyric', 'collect', 'volume', 'mute'
    ];
    function update(data: any) {
      setPlayer({ ...data });
      setVolume(data.volume ?? 100);
      // 歌曲切换时，立即拉取LRC歌词（防止歌词延迟）
      const songId = (data.name || '') + '|' + (data.singer || '');
      if (songId !== lastSongId) {
        setLastSongId(songId);
        fetchFullLyric();
      }
    }
    async function fetchStatus() {
      try {
        const response = await fetch(`${apiUrl}/status`);
        if (!response.ok) throw new Error('API连接失败');
        const data = await response.json();
        update(data);
      } catch (error: any) {
        alert('API连接失败：' + (error?.message || error));
      }
    }
    fetchStatus();
    eventSource = new EventSource(`${apiUrl}/subscribe-player-status?filter=${fields.join(',')}`);
    fields.forEach(field => {
      eventSource!.addEventListener(field, e => {
        try {
          sseStatus[field] = JSON.parse((e as MessageEvent).data);
        } catch {
          sseStatus[field] = (e as MessageEvent).data;
        }
        update(sseStatus);
      });
    });
    eventSource.onerror = () => {
      setTimeout(() => {
        if (eventSource) eventSource.close();
        fetchStatus();
      }, 3000);
    };
    return () => {
      if (eventSource) eventSource.close();
    };
    // eslint-disable-next-line
  }, [apiUrl]);

  // 控制播放器
  const controlPlayer = async (action: string, params: Record<string, any> = {}) => {
    try {
      const url = new URL(`${apiUrl}/${action}`);
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
      const response = await fetch(url.toString(), { method: 'POST' });
      if (!response.ok) throw new Error(`控制失败: ${action}`);
    } catch (error: any) {
      alert('控制失败：' + (error?.message || error));
    }
  };

  // 进度条点击
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!player) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newPosition = player.duration * percent;
    controlPlayer('seek', { offset: newPosition.toFixed(2) });
  };

  // 音量条点击
  const handleVolumeBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!player) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newVolume = Math.min(100, Math.max(0, Math.round(percent * 100)));
    controlPlayer('volume', { volume: newVolume });
  };

  // 进度条滑动优化：时间预览
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const [seekPreviewTime, setSeekPreviewTime] = useState<string | null>(null);
  const isSeeking = useRef(false);

  const handleProgressBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!player) return;
    isSeeking.current = true;
    updateSeekPreview(e.clientX);
    window.addEventListener('mousemove', handleProgressBarMouseMoveDrag);
    window.addEventListener('mouseup', handleProgressBarMouseUp);
  };
  const handleProgressBarMouseMoveDrag = (event: MouseEvent) => {
    if (!isSeeking.current || !player) return;
    updateSeekPreview(event.clientX);
  };
  const handleProgressBarMouseUp = (_event: MouseEvent) => {
    if (!player) return;
    if (isSeeking.current && seekPreview !== null) {
      controlPlayer('seek', { offset: seekPreview.toFixed(2) });
    }
    setSeekPreview(null);
    setSeekPreviewTime(null);
    isSeeking.current = false;
    window.removeEventListener('mousemove', handleProgressBarMouseMoveDrag);
    window.removeEventListener('mouseup', handleProgressBarMouseUp);
  };
  const updateSeekPreview = (clientX: number) => {
    const bar = document.getElementById('progressBar');
    if (!bar || !player) return;
    const rect = bar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newPosition = player.duration * percent;
    setSeekPreview(newPosition);
    // 计算时间字符串（四舍五入到秒，且不超出duration）
    const previewSec = Math.max(0, Math.min(player.duration, Math.round(newPosition)));
    const min = Math.floor(previewSec / 60);
    const sec = (previewSec % 60).toString().padStart(2, '0');
    setSeekPreviewTime(`${min}:${sec}`);
  };

  // 音量条滑动优化：只在拖动时本地预览，松开鼠标时才发送控制，且预览条宽度实时更新
  const [volumePreview, setVolumePreview] = useState<number | null>(null);
  const isAdjustingVolume = useRef(false);

  const handleVolumeBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!player) return;
    isAdjustingVolume.current = true;
    updateVolumePreview(e.clientX);
    window.addEventListener('mousemove', handleVolumeBarMouseMoveDrag);
    window.addEventListener('mouseup', handleVolumeBarMouseUp);
  };
  const handleVolumeBarMouseMoveDrag = (event: MouseEvent) => {
    if (!isAdjustingVolume.current || !player) return;
    updateVolumePreview(event.clientX);
  };
  const handleVolumeBarMouseUp = (_event: MouseEvent) => {
    if (!player) return;
    if (isAdjustingVolume.current && volumePreview !== null) {
      controlPlayer('volume', { volume: Math.round(volumePreview) });
    }
    setVolumePreview(null);
    isAdjustingVolume.current = false;
    window.removeEventListener('mousemove', handleVolumeBarMouseMoveDrag);
    window.removeEventListener('mouseup', handleVolumeBarMouseUp);
  };
  const updateVolumePreview = (clientX: number) => {
    const bar = document.getElementById('volumeBar');
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setVolumePreview(percent * 100);
  };

  // 暂停自动滚动
  const pauseAutoScroll = () => {
    setAutoScroll(false);
    setTimeout(() => setAutoScroll(true), 5000);
  };

  useEffect(() => {
    // 页面加载完毕后延迟去除动画（可根据实际数据加载情况调整）
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  // 进度条悬浮显示当前时间
  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!player) return;
    const rect = (e.target as HTMLDivElement).getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seconds = Math.round(player.duration * percent);
    const min = Math.floor(seconds / 60);
    const sec = (seconds % 60).toString().padStart(2, '0');
    (e.target as HTMLDivElement).setAttribute('data-tooltip', `${min}:${sec}`);
  };

  // 音量条悬浮显示当前音量
  const handleVolumeBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!player) return;
    const rect = (e.target as HTMLDivElement).getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const vol = Math.round(percent * 100);
    (e.target as HTMLDivElement).setAttribute('data-tooltip', `音量: ${vol}`);
  };

  // 鼠标移出时清除tooltip
  const handleBarMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    (e.target as HTMLDivElement).removeAttribute('data-tooltip');
  };

  // 刷新播放器信息和歌词
  const refreshPlayerInfo = async () => {
    try {
      // 刷新播放器状态
      const response = await fetch(`${apiUrl}/status`);
      if (response.ok) {
        const data = await response.json();
        setPlayer({ ...data });
        setVolume(data.volume ?? 100);
        setProgress(data.progress ?? 0);
        setDuration(data.duration ?? 0);
      }
      // 刷新完整歌词
      await fetchFullLyric();
    } catch (error) {
      console.error('刷新信息失败:', error);
    }
  };

  // 侧边栏内容切换（可扩展更多面板）
  const renderSidebarContent = () => {
    switch (sidebarPanel) {
      case 'api':
        return (
          <div className="sidebar-content">
            <div className="sidebar-section">
              <label htmlFor="apiUrlInput" className="font-095em">API地址</label>
              <div className="sidebar-input-group">
                <input
                  id="apiUrlInput"
                  type="text"
                  className="sidebar-input"
                  value={apiUrl}
                  onChange={e => setApiUrl(e.target.value)}
                  placeholder="API地址，如 http://192.168.1.100:23330"
                />
                <button
                  id="saveApiUrlBtn"
                  className="sidebar-btn square"
                  onClick={handleSaveApiUrl}
                  type="button"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        );
      case 'ui':
        return (
          <div className="sidebar-content">
            <div className="sidebar-section">
              <label className="font-095em" htmlFor="blurSwitch">界面模糊特效</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  id="blurSwitch"
                  type="checkbox"
                  checked={blurEnabled}
                  onChange={e => setBlurEnabled(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <span>{blurEnabled ? '已开启（推荐）' : '已关闭（低配/兼容）'}</span>
              </div>
              <div className="font-095em" style={{ color: '#aaa', marginTop: 8 }}>
                关闭后可提升低配设备性能
              </div>
            </div>
          </div>
        );
      case 'about':
      default:
        return (
          <div className="sidebar-content">
            <div className="sidebar-section">
              <h4 style={{ marginBottom: 8 }}>关于本项目</h4>
              <div style={{ fontSize: '1.05em', marginBottom: 8 }}>
                <b>项目名称：</b>LX Music API Controller Web
              </div>
              <div style={{ fontSize: '1.05em', marginBottom: 8 }}>
                <b>项目目的：</b>通过网页控制 LX Music 播放器，实现跨设备、跨平台的音乐播放控制与歌词展示体验。
              </div>
              <div style={{ fontSize: '1.05em', marginBottom: 8 }}>
                <b>技术栈：</b>React 18、TypeScript、Vite、CSS3、EventSource(SSE)、FontAwesome
              </div>
              <div style={{ fontSize: '0.98em', color: '#aaa' }}>
                <a href="https://lxmusic.toside.cn/desktop/open-api" target="_blank" rel="noopener noreferrer" style={{ color: '#8e44ad' }}>
                  LX Music Open API 文档
                </a>
                &nbsp;|&nbsp;
                <a href="https://github.com/lyswhut/lx-music-desktop" target="_blank" rel="noopener noreferrer" style={{ color: '#8e44ad' }}>
                  LX Music 桌面端
                </a>
              </div>
            </div>
          </div>
        );
    }
  };

  // UI渲染
  return (
    <>
      {/* 启动动画遮罩层 */}
      {loading && (
        <div className="app-launch-mask">
          <div className="app-launch-logo">
            <i className="fas fa-music"></i>
            <span>LX Music</span>
          </div>
        </div>
      )}
      {/* 汉堡按钮（左上角） */}
      <button
        className={`hamburger-btn${showSidebar ? ' hide' : ''}`}
        aria-label="菜单"
        onClick={() => setShowSidebar(true)}
        style={{display: loading ? 'none' : undefined}}
        type="button"
      >
        <span className="bar"></span>
        <span className="bar"></span>
        <span className="bar"></span>
      </button>
      <div
        id="sidebar"
        className={showSidebar ? 'show' : ''}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        onClick={e => {
          // 点击侧边栏空白处关闭
          if (e.target === e.currentTarget) setShowSidebar(false);
        }}
      >
        <div className="sidebar-header">
          <span className="sidebar-title">菜单</span>
          <button className="close-btn" title="关闭" onClick={() => setShowSidebar(false)} type="button">&times;</button>
        </div>
        <div className="sidebar-menu">
          <button
            className={`sidebar-menu-btn${sidebarPanel === 'api' ? ' active' : ''}`}
            onClick={() => setSidebarPanel('api')}
            type="button"
          >
            <i className="fas fa-link"></i> API设置
          </button>
          <button
            className={`sidebar-menu-btn${sidebarPanel === 'ui' ? ' active' : ''}`}
            onClick={() => setSidebarPanel('ui')}
            type="button"
          >
            <i className="fas fa-sliders-h"></i> UI设置
          </button>
          <button
            className={`sidebar-menu-btn${sidebarPanel === 'about' ? ' active' : ''}`}
            onClick={() => setSidebarPanel('about')}
            type="button"
          >
            <i className="fas fa-info-circle"></i> 关于
          </button>
        </div>
        {renderSidebarContent()}
      </div>
      <div
        className={`cover-bg${player?.picUrl ? ' has-bg' : ''}`}
        id="coverBg"
        style={
          player?.picUrl
            ? {
                backgroundImage: `linear-gradient(135deg, #181c2a 0%, #181c2a 100%), url('${player.picUrl}')`
              }
            : undefined
        }
      ></div>
      {/* ...播放器主内容... */}
      <div className="container">
        <div className="main-content">
          <div className="player-section">
            <div className="now-playing-card">
              <img
                src={player?.picUrl || ""}
                alt={player?.picUrl ? (player?.name || "Album Art") : "无封面"}
                className={`album-art${!player?.picUrl ? " default" : ""}`}
                id="albumArt"
                onError={e => {
                  (e.currentTarget as HTMLImageElement).classList.add('default');
                  (e.currentTarget as HTMLImageElement).src = '';
                  (e.currentTarget as HTMLImageElement).alt = '无封面';
                }}
              />
              {!player?.picUrl && (
                <i className="fas fa-music fa-3x album-art default-icon"></i>
              )}
              <div className="song-details">
                <div className="song-title" id="songTitle">{player?.name || "等待LX Music播放音乐"}</div>
                <div className="song-artist" id="songArtist">{player?.singer || "艺术家信息将显示在这里"}</div>
                <div className="song-album">
                  <i className="fas fa-compact-disc"></i>
                  <span id="songAlbum">{player?.albumName || "专辑信息将显示在这里"}</span>
                </div>
                <div id="playerStatus" className={`status-badge status-${player?.status || 'stopped'}`}>{getStatusText(player?.status)}</div>
              </div>
            </div>
            <div className="player-controls">
              <div className="progress-container">
                <div className="progress-time" id="currentTime">{`${Math.floor(progress / 60)}:${(Math.floor(progress % 60)).toString().padStart(2, '0')}`}</div>
                <div
                  className="progress-bar"
                  id="progressBar"
                  onClick={handleProgressBarClick}
                  onMouseMove={e => {
                    // ...existing code...
                    handleProgressBarMouseMove(e);
                  }}
                  onMouseLeave={e => {
                    handleBarMouseLeave(e);
                    setSeekPreviewTime(null);
                    setSeekPreview(null);
                  }}
                  onMouseDown={handleProgressBarMouseDown}
                >
                  <div
                    className="progress"
                    id="progress"
                    style={{
                      width:
                        isSeeking.current && seekPreview !== null && duration > 0
                          ? `${(seekPreview / duration) * 100}%`
                          : duration > 0
                          ? `${(progress / duration) * 100}%`
                          : "0%",
                      background: "#fff",
                      transition: isSeeking.current ? "none" : "width 0.1s linear"
                    }}
                  ></div>
                  {seekPreviewTime && seekPreview !== null && duration > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        left: `calc(${(seekPreview / duration) * 100}% - 24px)`,
                        top: "-32px",
                        background: "rgba(30,30,40,0.95)",
                        color: "#fff",
                        padding: "4px 12px",
                        borderRadius: "8px",
                        fontSize: "0.95rem",
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        zIndex: 10,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                        opacity: 1,
                        transition: "opacity 0.2s"
                      }}
                    >
                      {seekPreviewTime}
                    </div>
                  )}
                </div>
                <div className="progress-time" id="totalTime">{`${Math.floor(duration / 60)}:${(Math.floor(duration % 60)).toString().padStart(2, '0')}`}</div>
              </div>
              <div className="control-buttons">
                <button className="control-btn" id="shuffleBtn" title="随机播放" onClick={() => controlPlayer('shuffle')}>
                  <i className="fas fa-random"></i>
                </button>
                <button className="control-btn" id="prevBtn" title="上一首" onClick={() => controlPlayer('skip-prev')}>
                  <i className="fas fa-step-backward"></i>
                </button>
                <button className="control-btn play-btn" id="playBtn" title={player?.status === 'playing' ? "暂停" : "播放"}
                  onClick={() => controlPlayer(player?.status === 'playing' ? 'pause' : 'play')}>
                  <i className={`fas ${player?.status === 'playing' ? 'fa-pause' : 'fa-play'}`}></i>
                </button>
                <button className="control-btn" id="nextBtn" title="下一首" onClick={() => controlPlayer('skip-next')}>
                  <i className="fas fa-step-forward"></i>
                </button>
                <button className="control-btn" id="repeatBtn" title="刷新信息" onClick={refreshPlayerInfo}>
                  <i className="fas fa-redo"></i>
                </button>
              </div>
              <div className="volume-container">
                <i className="fas fa-volume-up volume-icon"></i>
                <div className="volume-bar" id="volumeBar"
                  onClick={handleVolumeBarClick}
                  onMouseMove={handleVolumeBarMouseMove}
                  onMouseLeave={handleBarMouseLeave}
                  onMouseDown={handleVolumeBarMouseDown}
                >
                  <div
                    className="volume-level"
                    id="volumeLevel"
                    style={{
                      width:
                        isAdjustingVolume.current && volumePreview !== null
                          ? `${volumePreview}%`
                          : `${volume}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
          <div className="lyrics-section">
            <div className="lyrics-toolbar"></div>
            <div className="lyrics-container" id="lyricsContainer"
              ref={lyricsRef}
              onWheel={pauseAutoScroll}
              onTouchStart={pauseAutoScroll}
              style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
            >
              {lrcLines.length > 0 ? lrcLines.map((line, idx) =>
                <div
                  key={idx}
                  className={`lyrics-line${idx === activeIdx ? ' active' : ''}`}
                  onClick={() => controlPlayer('seek', { offset: line.time.toFixed(2) })}
                  title="点击跳转到此处"
                  style={idx === activeIdx ? { alignSelf: 'center' } : undefined}
                >
                  {line.text || '♪'}
                </div>
              ) : (
                <div className="lyrics-line">{player?.lyricLineText || "暂无歌词"}</div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* ...existing code... */}
    </>
  );
}
