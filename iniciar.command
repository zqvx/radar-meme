#!/bin/sh
set -e
cd "$(dirname "$0")"

if [ ! -f "package.json" ]; then
  echo "ERRO: nao encontrei package.json nesta pasta."
  echo ""
  echo "Isto normalmente acontece quando corres este script diretamente"
  echo "de dentro do ficheiro .zip, sem extrair primeiro."
  echo ""
  echo "Solucao: extrai TODO o conteudo do zip para uma pasta normal"
  echo "e volta a correr o iniciar.command dentro dessa pasta."
  read -p "Prime Enter para sair..." _
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nao encontrado."
  echo "Instala primeiro em https://nodejs.org (versao 20 ou superior) e volta a correr este ficheiro."
  read -p "Prime Enter para sair..." _
  exit 1
fi

echo "Node.js encontrado: $(node --version)"

if [ ! -d "node_modules" ]; then
  echo "A instalar dependencias pela primeira vez (pode demorar 1-2 min)..."
  npm install
fi

echo "A arrancar o servidor..."
npm run dev > /tmp/radarmeme-dev.log 2>&1 &
SERVER_PID=$!

echo "A aguardar o servidor ficar pronto..."
ready=0
i=0
while [ $i -lt 40 ]; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:8090/ 2>/dev/null | grep -q "200"; then
    ready=1
    break
  fi
  sleep 1
  i=$((i + 1))
done

if [ "$ready" = "1" ]; then
  echo "Servidor pronto. A abrir o browser..."
  if command -v open >/dev/null 2>&1; then
    open http://localhost:8090/
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:8090/
  fi
else
  echo "O servidor ainda nao respondeu apos 40 segundos."
  echo "Ve o log em /tmp/radarmeme-dev.log ou tenta abrir"
  echo "http://localhost:8090/ manualmente daqui a pouco."
fi

echo ""
echo "O servidor continua a correr em segundo plano (PID $SERVER_PID)."
echo "Fecha esta janela ou prime Ctrl+C para o desligar."
echo ""
wait $SERVER_PID
