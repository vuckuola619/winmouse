# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

c_datas, c_binaries, c_hiddenimports = collect_all('clr')
cl_datas, cl_binaries, cl_hiddenimports = collect_all('clr_loader')
pn_datas, pn_binaries, pn_hiddenimports = collect_all('pythonnet')

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=c_binaries + cl_binaries + pn_binaries,
    datas=[('templates', 'templates'), ('static', 'static')] + c_datas + cl_datas + pn_datas,
    hiddenimports=c_hiddenimports + cl_hiddenimports + pn_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='WinMouse',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='icon.ico',
)
