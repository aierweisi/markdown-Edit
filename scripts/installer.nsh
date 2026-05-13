; Custom NSIS hooks for Markdown Editor installer
; 安装/卸载完成后强制 Windows 刷新图标缓存与 Shell 关联,避免覆盖安装时桌面快捷方式仍显示旧图标

!macro customInstall
  ; SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0x0000
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  ; 触发 Shell 重建图标缓存(静默执行,不阻塞安装)
  nsExec::Exec 'ie4uinit.exe -show'
!macroend

!macro customUnInstall
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  nsExec::Exec 'ie4uinit.exe -show'
!macroend
