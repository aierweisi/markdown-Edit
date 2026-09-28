@echo off
cd /d C:\Users\86176\Desktop\markdown
set DEBUG=electron-builder*
node node_modules\electron-builder\out\cli\cli.js --win > eb3.log 2>&1
