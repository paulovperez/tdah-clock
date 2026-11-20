# TDAH Clock

Seu cérebro externo: captura em linguagem natural, lembretes acionáveis, alarmes, compras, rotinas, memória e contas — offline, sem servidor, sem IA obrigatória.

## Rodar

```bash
npm install
npm run dev          # desenvolvimento → http://localhost:5173
npm run build && npm run preview   # versão de produção (PWA + offline) → http://localhost:4173
```

Instale como app: no Edge/Chrome, ícone "Instalar" na barra de endereço (desktop) ou "Adicionar à tela inicial" (Android).

## Testes

```bash
npm test             # 49 testes unitários: parser pt/en, recorrência, motor de lembretes, alarmes, priorização, planejador
npm run typecheck
# E2E (50 verificações no Edge instalado, com relógio simulado):
npm run build && npx vite preview --port 4173   # em outro terminal
node e2e/run.mjs                                 # screenshots em e2e/shots/
```

## Arquitetura

```
src/lib/        lógica pura e testada (sem React)
  parser.ts       linguagem natural pt-BR + inglês → tarefa / compra / nota / conta
  engine.ts       motor de lembretes: (estado, agora) → lembretes devidos (dedupe, soneca, insistência, silêncio)
  prioritize.ts   AGORA / EM SEGUIDA / DEPOIS com limites (nunca uma lista infinita)
  planner.ts      plano do dia realista: folga nas estimativas, intervalos, máx. 70% do tempo livre
  recurrence.ts   diária / semanal / mensal (com dia 31 → fim do mês) / anual
  sound.ts        sons de alarme sintetizados (WebAudio), volume crescente
  notify.ts       notificações do sistema via service worker, com botões Feito / +15 min
src/store/      estado local-first (localStorage), migração de versões, desfazer, sync entre abas
src/views/      Hoje, Tarefas, Relógio, Compras, Memória, Rotinas, Contas, Despejo mental, Planejar, Ajustes
public/sw.js    cache offline + ações de notificação
```

Todo o "cérebro" está em `src/lib` como funções puras, então pode ser reaproveitado num empacotamento nativo sem reescrever.

## Limitações da plataforma (importante)

Um app web **não consegue** garantir alarmes com o navegador fechado:

| Situação | Funciona? |
|---|---|
| App aberto (aba visível ou em segundo plano recente) | ✅ alarmes, lembretes, timers, notificações do sistema |
| **Modo cabeceira** (Relógio → Modo cabeceira) | ✅ mantém a tela ligada (Wake Lock) — use para acordar |
| Navegador/app fechado | ❌ nada toca (falta API de agendamento em navegadores) |
| Alarme atrasado ao reabrir | Toca se o atraso for < 10 min; lembretes de tarefas valem por 12 h |
| Geolocalização ("quando chegar no mercado") | Manual: "Vou sair de casa" e filtro por loja nas Compras |
| Som antes de qualquer toque na página | Navegadores bloqueiam; o app desbloqueia no primeiro toque |

**Próximo passo para alarmes 100% confiáveis:** empacotar com **Capacitor** (Android: `AlarmManager` exato via `@capacitor/local-notifications`, geofencing) ou **Tauri** (desktop, rodando na bandeja). Basta implementar um adaptador em `notify.ts`/`engine.ts` que agende os próximos N eventos no sistema operacional.

## Privacidade

Tudo fica no aparelho (localStorage + armazenamento persistente). Nenhum dado é enviado. Backup/restauração em JSON nos Ajustes.

## Atalhos

`N` capturar · `/` buscar · `1`–`5` abas · `Esc` fechar · `Ctrl+Enter` salvar memória

## Publicar (GitHub Pages)

```bash
npm run deploy   # testa, gera o build e publica no branch gh-pages
```

Site: https://paulovperez.github.io/tdah-clock/ — deploy automático a cada push também é possível:
rode `gh auth refresh -s workflow` e mova `deploy/github-pages-workflow.yml` para `.github/workflows/pages.yml`
(em Settings → Pages, troque a fonte para "GitHub Actions").
