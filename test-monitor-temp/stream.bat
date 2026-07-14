@echo off
for /L %%i in (1,1,5) do (
  echo line%%i
  ping -n 1 127.0.0.1 > nul
)