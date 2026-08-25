# 📡 Radar Meme

Scanner de memecoins narrativas (tipo CyberLeek) com X-Ray de risco, calendário de catálises e diário de apostas de 1€.

## Como correr
Zero dependências — só Python 3.

```bash
python3 server.py
```

Depois abre **http://localhost:8000** no browser.

## O que faz
- **📡 Radar** — escaneia tokens promovidos/novos na DexScreener e pontua (0–80) com checklist de risco: idade, mcap, vol/mcap, liquidez, momentum + red flags (lavagem, supply bloqueado, dump em curso).
- **🔬 X-Ray** — cola qualquer endereço de contrato → métricas ao vivo, score automático, red flags e checklist manual (catálise com data, social, LP queimada) → veredicto final 0–100.
- **📅 Catálises** — calendário de eventos com data marcada (curado + os teus, guardados no browser).
- **📒 Diário** — regista cada aposta de 1€ (com endereço opcional para preço automático) e vê o P&L em euros.

## Notas
- Dados ao vivo da **DexScreener** (API pública, sem chave). Rate limit do scan: ~20s entre execuções.
- Os teus dados (catálises próprias, diário, câmbio) ficam **só no teu browser** (localStorage) — nada é enviado a lado nenhum.
- Isto é uma ferramenta de análise, **não** é aconselhamento financeiro. 7 em 10 destas moedas perdem 70–100%.

## Correções aplicadas (rev.)
- **XSS**: campos vindos da DexScreener (símbolo, nome, descrição, socials, websites) agora passam por `esc()` antes de irem para `innerHTML`, tanto no Radar como no X-Ray. Também aplicado ao nome/endereço no Diário e ao título/nota nas Catálises.
- **Bug de score**: token com `mcap` desconhecido (0) já não ganhava indevidamente +15 pontos como "mcap pequena" — as condições agora exigem `mcap > 0`.
- **`chain_id` morto**: `enrich()` agora usa mesmo o `chain_id` para preferir o par certo quando o endereço existe em mais que uma chain.
- **`/api/price`**: passou a validar o endereço com o mesmo regex do `/api/xray` (antes aceitava qualquer string).
