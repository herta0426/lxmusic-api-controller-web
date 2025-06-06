import React, { useEffect, useRef, useState } from 'react';

interface PlayerStatus {
  status: string;
  name: string;
  singer: string;
  albumName: string;
  picUrl: string;
  progress: number;
  duration: number;
  lyricLineText: string;
  volume: number;
}

const API_BASE_URL = localStorage.getItem('lx_api_url') || 'http://127.0.0.1:23330';

const Player: React.FC = () => {
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);

  // SSE订阅
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let sseStatus: any = {};
    const fields = [
      'status', 'name', 'singer', 'albumName', 'duration', 'progress', 'playbackRate',
      'picUrl', 'lyricLineText', 'lyricLineAllText', 'lyric', 'collect', 'volume', 'mute'
    ];
    function update(data: any) {
      setStatus({
        status: data.status || 'stoped',
        name: data.name || '未知歌曲',
        singer: data.singer || '未知艺术家',
        albumName: data.albumName || '未知专辑',
        picUrl: data.picUrl || '',
        progress: Number(data.progress) || 0,
        duration: Number(data.duration) || 0,
        lyricLineText: data.lyricLineText || '',
        volume: typeof data.volume === 'number' ? data.volume : 100,
      });
      setProgress(Number(data.progress) || 0);
      setDuration(Number(data.duration) || 0);
      setVolume(typeof data.volume === 'number' ? data.volume : 100);
      // 封面背景
      const coverBg = document.getElementById('coverBg');
      if (coverBg) {
        coverBg.style.backgroundImage = data.picUrl ? `url('${data.picUrl}')` : '';
      }
    }
    fetch(`${API_BASE_URL}/status`)
      .then(res => res.json())
      .then(update)
      .catch(() => {});
    eventSource = new window.EventSource(`${API_BASE_URL}/subscribe-player-status?filter=status,name,singer,albumName,lyricLineText,duration,progress,playbackRate,volume,mute,collect,picUrl`);
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
      setTimeout(() => window.location.reload(), 3000);
    };
    return () => {
      eventSource && eventSource.close();
    };
  }, []);

  // 控制播放器
  const controlPlayer = async (action: string, params: Record<string, any> = {}) => {
    try {
      const url = new URL(`${API_BASE_URL}/${action}`);
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
      await fetch(url.toString(), { method: 'POST' });
    } catch {}
  };

  // 进度条点击
  const progressBarRef = useRef<HTMLDivElement>(null);
  const handleProgressClick = (e: React.MouseEvent) => {
    if (!status) return;
    const rect = progressBarRef.current!.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newPosition = status.duration * percent;
    controlPlayer('seek', { offset: newPosition.toFixed(2) });
  };

  // 音量条点击
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const handleVolumeClick = (e: React.MouseEvent) => {
    if (!status) return;
    const rect = volumeBarRef.current!.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newVolume = Math.min(100, Math.max(0, Math.round(percent * 100)));
    controlPlayer('volume', { volume: newVolume });
  };

  return (
    <div className="player-section">
      <div className="now-playing-card">
        <div className="album-art-wrapper">
          <img
            src={status?.picUrl || ''}
            alt={status?.name || 'Album Art'}
            className={`album-art${!status?.picUrl ? ' default' : ''}`}
            id="albumArt"
          />
          {!status?.picUrl && (
            <i className="fas fa-music fa-3x album-art default-icon"></i>
          )}
        </div>
        <div className="song-details">
          <div className="song-title" id="songTitle">{status?.name || '等待LX Music播放音乐'}</div>
          <div className="song-artist" id="songArtist">{status?.singer || '艺术家信息将显示在这里'}</div>
          <div className="song-album">
            <i className="fas fa-compact-disc"></i>
            <span id="songAlbum">{status?.albumName || '专辑信息将显示在这里'}</span>
          </div>
          <div id="playerStatus" className={`status-badge status-${status?.status || 'stoped'}`}>
            {status?.status === 'playing'
              ? '播放中'
              : status?.status === 'paused'
              ? '已暂停'
              : status?.status === 'error'
              ? '错误'
              : '已停止'}
          </div>
        </div>
      </div>
      <div className="player-controls">
        <div className="progress-container">
          <div className="progress-time" id="currentTime">
            {Math.floor(progress / 60)}:{(Math.floor(progress % 60)).toString().padStart(2, '0')}
          </div>
          <div className="progress-bar" id="progressBar" ref={progressBarRef} onClick={handleProgressClick}>
            <div className="progress" id="progress"
              style={{ width: duration > 0 ? `${(progress / duration) * 100}%` : '0%' }} />
            <div className="progress-handle"></div>
          </div>
          <div className="progress-time" id="totalTime">
            {Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}
          </div>
        </div>
        <div className="control-buttons">
          <button className="control-btn" id="shuffleBtn" title="随机播放" onClick={() => controlPlayer('shuffle')}>
            <i className="fas fa-random"></i>
          </button>
          <button className="control-btn" id="prevBtn" title="上一首" onClick={() => controlPlayer('skip-prev')}>
            <i className="fas fa-step-backward"></i>
          </button>
          <button className="control-btn play-btn" id="playBtn" title={status?.status === 'playing' ? '暂停' : '播放'}
            onClick={() => controlPlayer(status?.status === 'playing' ? 'pause' : 'play')}>
            <i className={`fas fa-${status?.status === 'playing' ? 'pause' : 'play'}`}></i>
          </button>
          <button className="control-btn" id="nextBtn" title="下一首" onClick={() => controlPlayer('skip-next')}>
            <i className="fas fa-step-forward"></i>
          </button>
          <button className="control-btn" id="repeatBtn" title="重复播放" onClick={() => controlPlayer('repeat')}>
            <i className="fas fa-redo"></i>
          </button>
        </div>
        <div className="volume-container">
          <i className="fas fa-volume-up volume-icon"></i>
          <div className="volume-bar" id="volumeBar" ref={volumeBarRef} onClick={handleVolumeClick}>
            <div className="volume-level" id="volumeLevel" style={{ width: `${volume}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Player;
