import React from 'react';

interface Props {
  onClick: () => void;
}

const SettingsBtn: React.FC<Props> = ({ onClick }) => (
  <button id="settingsBtn" aria-label="设置" onClick={onClick}>
    <i className="fas fa-cog"></i>
  </button>
);

export default SettingsBtn;
