import React, { useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<Props> = ({ open, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const url = inputRef.current?.value.trim() || '';
    if (!/^https?:\/\/.+:\d+$/.test(url)) {
      alert('请输入正确的API地址（如 http://192.168.1.100:23330）');
      return;
    }
    localStorage.setItem('lx_api_url', url);
    window.location.reload();
  };

  return (
    <div id="sidebar" className={open ? 'show' : ''}>
      <button className="close-btn" title="关闭" onClick={onClose}>&times;</button>
      <h3 className="mb-18">设置</h3>
      <div className="sidebar-section">
        <label htmlFor="apiUrlInput" className="font-095em">API地址</label>
        <input
          id="apiUrlInput"
          type="text"
          placeholder="API地址，如 http://192.168.1.100:23330"
          ref={inputRef}
          defaultValue={localStorage.getItem('lx_api_url') || 'http://127.0.0.1:23330'}
        />
        <button id="saveApiUrlBtn" onClick={handleSave}>保存API地址</button>
      </div>
      <button className="debug-btn mt-24" id="debugBtn" onClick={() => alert('调试功能触发！（你可以在这里实现更多调试逻辑）')}>调试</button>
    </div>
  );
};

export default Sidebar;
