import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { EV, type MenuEventName } from '@shared/ipc'

interface MenuOpts {
  sendToRenderer(channel: MenuEventName): void
  onQuit(): void
}

export function setupApplicationMenu(opts: MenuOpts): void {
  const dispatch = (channel: MenuEventName): MenuItemConstructorOptions['click'] => () => {
    opts.sendToRenderer(channel)
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: dispatch(EV.MENU_NEW) },
        { label: '打开', accelerator: 'CmdOrCtrl+O', click: dispatch(EV.MENU_OPEN) },
        { label: '最近文件', accelerator: 'CmdOrCtrl+Shift+R', click: dispatch(EV.MENU_RECENT) },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: dispatch(EV.MENU_SAVE) },
        { label: '另存为', accelerator: 'CmdOrCtrl+Shift+S', click: dispatch(EV.MENU_SAVE_AS) },
        { type: 'separator' },
        { label: '导入文件', click: dispatch(EV.MENU_IMPORT) },
        { label: '导出 Markdown', click: dispatch(EV.MENU_EXPORT_MD) },
        { label: '导出 HTML', click: dispatch(EV.MENU_EXPORT_HTML) },
        { label: '导出 PDF', click: dispatch(EV.MENU_EXPORT_PDF) },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => { opts.onQuit(); app.quit() },
        },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '切换主题', accelerator: 'CmdOrCtrl+Shift+L', click: dispatch(EV.MENU_TOGGLE_THEME) },
        { label: '切换视图模式', accelerator: 'CmdOrCtrl+\\', click: dispatch(EV.MENU_TOGGLE_VIEW) },
        { label: '专注模式', accelerator: 'CmdOrCtrl+Shift+F', click: dispatch(EV.MENU_TOGGLE_FOCUS) },
        { label: '打开/切换工作区文件夹', click: dispatch(EV.MENU_OPEN_WORKSPACE) },
        { type: 'separator' },
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '模板',
      submenu: [{ label: '模板库', click: dispatch(EV.MENU_TEMPLATES) }],
    },
    {
      label: '设置',
      click: dispatch(EV.MENU_SETTINGS),
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
