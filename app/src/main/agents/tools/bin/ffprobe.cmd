@echo off
rem Puts the check in ..\guard.mjs in front of the real ffprobe for PowerShell and cmd. The app sets HFWIN_NODE and
rem HFWIN_GUARD; see ..\..\mediaTools.js. Paths come from those variables, not from this file, so a user name
rem with accents survives whatever code page cmd reads this file in.
setlocal
set ELECTRON_RUN_AS_NODE=1
"%HFWIN_NODE%" "%HFWIN_GUARD%" ffprobe %*
