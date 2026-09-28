@echo off
REM Module 09 - Win 7za wrapper. Inserts -snh (skip hardlinks) flag
REM so 7za does not try to create symlinks for archive internal hardlinks
REM like darwin/libssl.dylib to libcrypto.dylib, which fails on Windows
REM for non-developer users.
node "%~dp0electron-7za.cjs" %*
