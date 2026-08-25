@echo off
setlocal enabledelayedexpansion
title Radar Meme
cd /d "%~dp0"

echo ============================================
echo  Radar Meme - a preparar arranque
echo  Pasta: %cd%
echo ============================================
echo.

if not exist "package.json" (
  echo ERRO: nao encontrei package.json nesta pasta.
  echo.
  echo Isto normalmente acontece quando corres o iniciar.bat
  echo diretamente de dentro do ficheiro .zip, sem extrair primeiro.
  echo.
  echo Solucao: extrai TODO o conteudo do zip para uma pasta normal
  echo no teu computador ^(botao direito no zip -^> Extrair tudo^)
  echo e volta a fazer duplo-clique no iniciar.bat dentro dessa pasta.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado no teu sistema.
  echo.
  echo Instala primeiro em https://nodejs.org ^(versao 20 ou superior^),
  echo reinicia o computador se for a primeira instalacao, e volta a
  echo correr este ficheiro.
  echo.
  pause
  exit /b 1
)

echo Node.js encontrado:
node --version
echo.

rem --- Ja ha um servidor nosso a responder nesta porta? Reaproveita-o. ---
curl -s -o nul -w "%%{http_code}" http://localhost:8090/ > "%TEMP%\radarmeme_status.txt" 2>nul
set /p already_status=<"%TEMP%\radarmeme_status.txt"
del "%TEMP%\radarmeme_status.txt" >nul 2>nul

if "!already_status!"=="200" (
  echo Ja ha um Radar Meme a correr em http://localhost:8090/ - a abrir so o browser.
  start "" http://localhost:8090/
  echo.
  echo Podes fechar esta janela. O servidor que ja estava aberto
  echo continua a correr noutra janela.
  echo.
  pause
  exit /b 0
)

if not exist "node_modules" (
  echo A instalar dependencias pela primeira vez ^(pode demorar 1-2 min^)...
  echo A gravar detalhes em install-log.txt em caso de erro.
  call npm install > install-log.txt 2>&1
  if errorlevel 1 (
    echo.
    echo ERRO ao instalar dependencias. Detalhes em install-log.txt
    echo Abre esse ficheiro para ver o que falhou.
    echo.
    pause
    exit /b 1
  )
  echo Dependencias instaladas com sucesso.
  echo.
)

echo A arrancar o servidor numa janela separada chamada
echo "Radar Meme - servidor (nao fechar)"...
echo.
start "Radar Meme - servidor (nao fechar)" cmd /k "npm run dev"

echo A aguardar o servidor ficar pronto...
set ready=0
for /l %%i in (1,1,40) do (
  if !ready! == 0 (
    curl -s -o nul -w "%%{http_code}" http://localhost:8090/ > "%TEMP%\radarmeme_status.txt" 2>nul
    set /p status=<"%TEMP%\radarmeme_status.txt"
    if "!status!"=="200" (
      set ready=1
    ) else (
      timeout /t 1 /nobreak >nul
    )
  )
)
del "%TEMP%\radarmeme_status.txt" >nul 2>nul

if !ready! == 1 (
  echo Servidor pronto. A abrir o browser...
  start "" http://localhost:8090/
) else (
  echo O servidor ainda nao respondeu apos 40 segundos.
  echo.
  echo Se a outra janela mostrar "Port 8090 is already in use", ha
  echo um servidor antigo pendurado. Para o encontrar e fechar:
  echo   1. Abre outro cmd e escreve: netstat -ano ^| findstr :8090
  echo   2. Copia o ultimo numero da linha ^(o PID^)
  echo   3. Escreve: taskkill /PID numero_que_copiaste /F
  echo   4. Corre o iniciar.bat outra vez.
  echo.
  echo Ou olha para a janela "Radar Meme - servidor" para outros erros.
)

echo.
echo Esta janela pode ser fechada. O servidor continua a correr
echo na outra janela ^("Radar Meme - servidor"^) - fecha-a quando
echo quiseres desligar a app.
echo.
pause
