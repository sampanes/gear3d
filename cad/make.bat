@echo off
rem Build / check / export / render a cad model in a clean background Blender.
rem   cad\make.bat planetary_fidget save check export render %USERPROFILE%\Downloads
rem See cad\make.py for the steps. Uses the newest Blender under Program Files
rem unless BLENDER is set. Runs in the foreground; Ctrl+C stops it.
setlocal
if not defined BLENDER (
  for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender *") do (
    if exist "%%D\blender.exe" set "BLENDER=%%D\blender.exe"
  )
)
if not defined BLENDER (
  echo [X] no Blender found; set BLENDER=path\to\blender.exe
  exit /b 1
)
"%BLENDER%" -b --python "%~dp0make.py" -- %*
exit /b %ERRORLEVEL%
