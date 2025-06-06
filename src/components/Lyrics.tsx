import React, { useEffect, useRef, useState } from 'react';

interface LrcLine {
  time: number;
  text: string;
}

const API_BASE_URL = localStorage.getItem('lx_api_url') || 'http://127.0.0.1:23330';

function parseLRC(lrcText: string): LrcLine[] {
  const lines = lrcText.split('\n');
  const result: LrcLine[] = [];
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

const Lyrics: React.FC = () => {
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentLineText, setCurrentLineText] = useState('');
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // 获取歌词和进度
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let sseStatus: any = {};
    const fields = [
      'status', 'name', 'singer', 'albumName', 'duration', 'progress', 'playbackRate',
      'picUrl', 'lyricLineText', 'lyricLineAllText', 'lyric', 'collect', 'volume', 'mute'
    ];
    function update(data: any) {
      setProgress(Number(data.progress) || 0);
      setCurrentLineText(data.lyricLineText || '');
      if (data.lyric) {
        setLrcLines(parseLRC(data.lyric));
      }
    }
    fetch(`${API_BASE_URL}/status`)
      .then(res => res.json())
      .then(update)
      .catch(() => {});
    eventSource = new window.EventSource(`${API_BASE_URL}/subscribe-player-status?filter=status,name,singer,albumName,lyricLineText,duration,progress,playbackRate,volume,mute,collect,picUrl,lyric`);
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

  // 自动滚动到高亮歌词
  useEffect(() => {
    if (!autoScroll) return;
    const container = lyricsContainerRef.current;
    if (!container) return;
    const lines = Array.from(container.querySelectorAll('.lyrics-line'));
    let activeIdx = -1;
    for (let i = 0; i < lrcLines.length; i++) {
      if (progress >= lrcLines[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }
    if (activeIdx !== -1 && lines[activeIdx]) {
      const containerHeight = container.clientHeight;
      const lineHeight = (lines[activeIdx] as HTMLElement).offsetHeight;
      const scrollTop = (lines[activeIdx] as HTMLElement).offsetTop - containerHeight / 2 + lineHeight / 2;
      container.scrollTo({ top: scrollTop, behavior: 'smooth' });
    }
  }, [progress, lrcLines, autoScroll]);

  // 暂停自动滚动
  let autoScrollTimer = useRef<NodeJS.Timeout | null>(null);
  const pauseAutoScroll = () => {
    setAutoScroll(false);
    if (autoScrollTimer.current) clearTimeout(autoScrollTimer.current);
    autoScrollTimer.current = setTimeout(() => setAutoScroll(true), 5000);
  };

  // 渲染歌词
  let activeIdx = -1;
  for (let i = 0; i < lrcLines.length; i++) {
    if (progress >= lrcLines[i].time) {
      activeIdx = i;
    } else {
      break;
    }
  }

  return (
    <div className="lyrics-section">
      <div className="lyrics-toolbar"></div>
      <div
        className="lyrics-container"
        id="lyricsContainer"
        ref={lyricsContainerRef}
        onWheel={pauseAutoScroll}
        onTouchStart={pauseAutoScroll}
      >
        {lrcLines.length ? (
          lrcLines.map((line, idx) => (
            <div key={idx} className={`lyrics-line${idx === activeIdx ? ' active' : ''}`}>
              {line.text || '♪'}
            </div>
          ))
        ) : currentLineText ? (
          <div className="lyrics-line active">{currentLineText}</div>
        ) : (
          <>
            <div className="lyrics-line">等待播放音乐...</div>
            <div className="lyrics-line">歌词将显示在这里</div>
          </>
        )}
      </div>
    </div>
  );
};

export default Lyrics;
