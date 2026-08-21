# Ábsono

Ábsono é uma aplicação de comunicação corporativa inspirada em conceitos do Discord e Microsoft Teams, com arquitetura deliberadamente mais simples.

## Funcionalidades

- **Chat em canais de texto** — mensagens em tempo real (WebSocket/STOMP), edição/exclusão, respostas, busca com destaque, indicador de digitação, badges de não lidas
- **Anexos** — upload até 50MB com visualização inline de imagem/vídeo/áudio, lightbox para imagens e download sem sair do app
- **Chamadas de voz** — múltiplos participantes por canal, mute/desmute, seleção de dispositivos, troca de saída de áudio, abafar (silenciar todos), volume individual por participante, supressão de ruído com IA (Krisp)
- **Vídeo** — câmera dos participantes no grid, pin de participante em destaque
- **Compartilhamento de tela** — com áudio do sistema (Chrome/Edge), resolução/FPS configuráveis, Picture-in-Picture, tela cheia, controle de qualidade pelo espectador (Auto/Alta/Média/Baixa) e aviso de quem está assistindo
- **Presença** — usuários online na sidebar, participantes por canal de voz, indicador de quem está falando, reconexão automática da chamada
- **Notificações** — notificações do navegador para mensagens fora do canal aberto, entrada na chamada e novos espectadores da sua tela
- **Permissões** — roles ADMIN/MODERATOR e permissões granulares por canal (ler/escrever/gerenciar), aplicadas inclusive ao entrar em chamadas

## Requisitos

- **Sistema Operacional:** Linux ou Windows
- **Podman** (ou Docker) e podman-compose
- **Java 17+**
- **Node.js 18+**
- **Gradle** (wrapper incluso)

## Estrutura do Projeto

```
absono/
├── backend/              # Spring Boot + Groovy + MyBatis
├── frontend/             # Vue 3 + TypeScript + Pinia + Element Plus
│   └── nginx.conf        # SPA + proxy /api e /ws (usado no container de prod)
├── desktop/              # Shell desktop em Electron
├── scripts/              # Utilitários (init-garage.sh)
├── compose.yml           # Infra de desenvolvimento
├── compose.prod.yml      # Stack completa para VPS
├── Caddyfile.prod        # TLS/roteamento do Caddy na VPS
├── livekit.yaml          # Configuração do LiveKit (dev, rede host)
├── livekit.prod.yaml     # Configuração do LiveKit (VPS)
├── garage.toml           # Configuração do Garage
├── .env.example          # Variáveis de ambiente
└── README.md
```

## Instalação

### 1. Copiar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` conforme necessário.

### 2. Iniciar infraestrutura

```bash
docker compose up -d        # ou podman-compose up -d
```

Isso irá iniciar:
- PostgreSQL (porta 5432)
- Redis (porta 6379)
- LiveKit (porta 7880 — rede do host, para WebRTC funcionar na LAN)
- Garage (porta 3902)

### 3. Criar banco de dados

```bash
psql -h localhost -U absono -d absono -f backend/src/main/resources/db/migration/V1__create_tables.sql
psql -h localhost -U absono -d absono -f backend/src/main/resources/db/migration/V2__seed_channels.sql
```

Ou utilize o Flyway que está configurado no Spring Boot (executa automaticamente ao iniciar).

### 4. Configurar Garage

O Garage exige inicialização do cluster na primeira execução:

```bash
# 1. Obter o ID do nó e atribuir capacidade ao layout
NODE_ID=$(podman exec absono-garage /garage status | grep -oP '^[0-9a-f]{16}' | head -1)
podman exec absono-garage /garage layout assign -z dc1 -c 1G "$NODE_ID"
podman exec absono-garage /garage layout apply --version 1

# 2. Criar bucket
podman exec absono-garage /garage bucket create absono

# 3. Importar chave com as credenciais do .env
podman exec absono-garage /garage key import --yes garage_access_key garage_secret_key -n absono-key

# 4. Autorizar a chave no bucket
podman exec absono-garage /garage bucket allow absono --read --write --owner --key garage_access_key
```

> Na VPS, o `./scripts/init-garage.sh` faz os passos 2–4 automaticamente
> (o layout precisa ser atribuído uma vez, como acima).

### 5. Executar o Backend

```bash
cd backend
./gradlew bootRun
```

O backend estará disponível em `http://localhost:8080`.

### 6. Executar o Frontend (desenvolvimento)

```bash
cd frontend
npm install
npm run dev
```

O frontend estará disponível em `http://localhost:3000`.

### 7. Executar o Desktop (Electron)

```bash
cd desktop
npm install       # ou pnpm install
npm run dev
```

Em desenvolvimento o Electron carrega `http://localhost:3000`; empacotado, carrega `dist/index.html`.

## Testar na rede local (LAN) — 2 PCs

Para que outro computador acesse a instância de desenvolvimento (ex.: IP `192.168.18.8`):

1. **Vite exposto na LAN** — `frontend/vite.config.ts` já possui `server.host: true`.

2. **URLs client-facing no backend** — em `backend/src/main/resources/application-dev.yml`:

   ```yaml
   livekit:
     url: ws://192.168.18.8:7880     # URL que os navegadores vão usar
   garage:
     endpoint: http://192.168.18.8:3902  # embutida nas URLs de mídia/download
   ```

3. **LiveKit na rede do host** — o `compose.yml` já usa `network_mode: host` para o
   serviço `livekit`, para que os candidatos ICE anunciados sejam o IP real da LAN
   (com rede bridge o container anuncia um IP interno inalcançável, causando
   *"could not establish pc connection"*).

4. Suba/reinicie tudo:

   ```bash
   /usr/local/bin/docker-compose -f compose.yml up -d --no-deps livekit  # recria o LiveKit
   cd backend && ./gradlew bootRun &
   cd frontend && npm run dev
   ```

5. No segundo PC, abra `http://192.168.18.8:3000`.

Portas envolvidas: `3000/tcp` (app), `8080/tcp` (API), `7880/tcp + 7881/tcp`
(sinal LiveKit), `50000-50100/udp` (mídia WebRTC), `3902/tcp` (Garage).

### Trocar o IP/URL no app desktop (Electron)

O desktop lê a variável de ambiente `ABSONO_SERVER_URL`. Por padrão aponta para
`http://localhost:3000` — para apontar para outro servidor:

```bash
cd desktop

# Apontando para o dev de outra máquina na LAN:
ABSONO_SERVER_URL=http://192.168.18.8:3000 npm run dev

# Apontando para a VPS:
ABSONO_SERVER_URL=http://SEU_IP npm start
```

Se `ABSONO_SERVER_URL` estiver definida ela tem prioridade mesmo em builds
empacotados; sem ela, o modo empacotado carrega o `dist/index.html` local e o
modo dev cai em `http://localhost:3000`.

### Observações de mídia por navegador

| Recurso | Chrome/Edge | Firefox | Safari |
|---|---|---|---|
| Compartilhar tela com áudio do sistema | ✓ | ✗ | ✗ |
| Supressão de ruído (Krisp) | ✓ | parcial | parcial |
| Picture-in-Picture | ✓ | ✓ | ✗ |

A qualidade do compartilhamento é configurável em **Configurações de Chamada →
Resolução/FPS** (aplicadas ao iniciar um novo compartilhamento) e o espectador
pode reduzir a qualidade recebida no seletor do spotlight.

## Deploy em VPS

A stack completa sobe com `compose.prod.yml`:

```
Internet ──► Caddy (:80/:443, TLS automático)
              ├── seu-dominio.sslip.io
              │     ├── /            → frontend (nginx: SPA + proxy /api e /ws → backend)
              │     └── /livekit/*   → LiveKit (sinalização wss)
              └── s3.seu-dominio.sslip.io → Garage (downloads/mídia presignados)
```

- **Caddy** é a porta de entrada: emite certificado Let's Encrypt sozinho
  (funciona **sem domínio próprio**, usando nomes `sslip.io` derivados do IP).
- **nginx** roda *dentro* do container de frontend (`frontend/Dockerfile`),
  servindo o build do Vue e fazendo proxy interno de `/api` e `/ws` ao backend —
  ele não tem porta pública; só o Caddy fala com ele.
- Backend, Postgres, Redis e LiveKit ficam na rede interna do compose.

### 1. Clonar e configurar

```bash
git clone https://github.com/edertelhado/absono.git && cd absono
cp .env.example .env
```

Edite o `.env` — se o IP da VPS for `201.71.20.54`:

| Variável | Exemplo | Para que serve |
|---|---|---|
| `PUBLIC_APP_DOMAIN` | `201-71-20-54.sslip.io` | Domínio do app (Caddy emite o TLS dele) |
| `PUBLIC_S3_DOMAIN` | `s3.201-71-20-54.sslip.io` | Domínio do S3 (assinatura SigV4 das URLs) |
| `JWT_SECRET` | `openssl rand -base64 48` | Segredo dos tokens da aplicação |
| `ACME_EMAIL` | seu e-mail | Avisos do Let's Encrypt (opcional) |

`LIVEKIT_URL` (`wss://…/livekit`) e `GARAGE_ENDPOINT` (`https://s3.…`) são
derivados automaticamente desses domínios. Com domínio próprio, use-o no lugar
do sslip.io.

> Requisito: portas **80 e 443** acessíveis da internet durante a primeira
> subida, para o desafio do Let's Encrypt.

### 2. Subir a stack

```bash
docker compose -f compose.prod.yml up -d --build
```

O compose falha rápido se `PUBLIC_APP_DOMAIN`, `PUBLIC_S3_DOMAIN` ou
`JWT_SECRET` não estiverem definidos — é intencional.

### 3. Inicializar o Garage (só na primeira vez)

```bash
./scripts/init-garage.sh
```

O script importa a chave do `.env` e cria o bucket, de forma idempotente.

### 4. Firewall da VPS

| Porta | Protocolo | Serviço |
|---|---|---|
| 80 | tcp | Caddy — desafio ACME |
| 443 | tcp+udp | Caddy — app HTTPS e HTTP/3 |
| 50000-50100 | udp | LiveKit — mídia WebRTC (direto, não passa pelo Caddy) |

Tudo o mais (nginx, backend, Postgres, Redis, Garage API, sinalização 7880)
fica atrás do Caddy ou na rede interna — não abra portas extras.
Opcionalmente libere `7881/tcp` como fallback ICE/TCP do LiveKit.

### 5. Acessar

Abra `https://SEU-DOMINIO.sslip.io` nos navegadores (o cadeado verde indica o
certificado emitido). Mic/câmera funcionam por ser um contexto seguro.

> **Nota:** na VPS o LiveKit usa rede bridge + `use_external_ip: true`
> (`livekit.prod.yaml`) — diferente do dev, onde usamos rede host porque os
> clientes estão na mesma LAN.

### Alternativa: VPS com portas 80/443 bloqueadas (DuckDNS)

Se a provedora bloqueia as portas padrão, use **DuckDNS + desafio DNS-01**:
o certificado é validado por registro TXT no DNS, então **nenhuma porta de
desafio é necessária** — só a HTTPS alternativa (4432).

1. No painel do [DuckDNS](https://www.duckdns.org) registre **dois nomes**
   na sua conta: `absono` e `absono-s3` (o S3 precisa de nome próprio porque
   o DuckDNS não tem sub-subdomínios).

2. No `.env`:

   ```bash
   PUBLIC_APP_DOMAIN=absono.duckdns.org
   PUBLIC_S3_DOMAIN=absono-s3.duckdns.org
   DUCKDNS_TOKEN=seu-token
   DUCKDNS_DOMAINS=absono,absono-s3
   HTTP_PORT=8081
   HTTPS_PORT=4432
   CADDYFILE=./Caddyfile.duck
   ```

3. Suba com os dois arquivos:

   ```bash
   docker compose -f compose.prod.yml -f compose.duck.yaml up -d --build
   ```

O que muda nesse modo:
- O Caddy roda numa imagem própria com o plugin
  [`caddy-dns/duckdns`](https://github.com/caddy-dns/duckdns)
  (`caddy/Dockerfile`) e valida o domínio via TXT record.
- Um sidecar (`duckdns-updater`) renova o apontamento do IP a cada 5 minutos
  para os dois domínios — ideal para IP dinâmico.
- URLs finais incluem a porta: `https://absono.duckdns.org:4432`,
  `wss://…:4432/livekit` e `https://absono-s3.duckdns.org:4432`.

Firewall: abra apenas `4432/tcp` (e mantenha `50000-50100/udp` da mídia).

## Configuração

### LiveKit

Edite `livekit.yaml` para ambientes de produção:

```yaml
keys:
  sua-api-key: sua-api-secret
```

### Garage

Configure as variáveis de ambiente para o Garage:

```
GARAGE_ENDPOINT=http://localhost:3902
GARAGE_ACCESS_KEY=sua-access-key
GARAGE_SECRET_KEY=sua-secret-key
GARAGE_BUCKET=absono
```

### WebSocket/STOMP

O WebSocket/STOMP está configurado no endpoint `/ws`:

- Conexão: `http://localhost:8080/ws`
- Destinos públicos: `/topic/channels/{channelId}`
- Destinos privados: `/user/queue/notifications`
- Presença de voz: `/topic/voice-state`

### Voice state (quem está nas chamadas)

O estado de voz é alimentado por **webhooks do LiveKit** em tempo real
(`participant_joined/left`, `track_published/unpublished`, `track_muted/unmuted`),
entregues em `POST /api/livekit/webhook` — autenticado por JWT assinado com a
mesma API key do LiveKit + hash SHA-256 do corpo. Um reconcile por polling roda
a cada 30s como fallback. O endpoint precisa estar acessível pelo container do
LiveKit (`localhost:8080` no dev com rede host; `backend:8080` na VPS).

## API

### Autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/register` | Cadastro |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |

### Usuários

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/me` | Usuário atual |
| PUT | `/api/me/profile` | Atualizar perfil |
| GET | `/api/users` | Listar/buscar usuários |

### Canais

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/channels` | Listar canais |
| POST | `/api/channels` | Criar canal |
| GET | `/api/channels/{id}` | Buscar canal |
| GET | `/api/channels/{id}/my-permissions` | Permissões efetivas do usuário atual |
| PUT | `/api/channels/{id}` | Atualizar canal |
| PUT | `/api/channels/{id}/reorder` | Reordenar canais |
| DELETE | `/api/channels/{id}` | Excluir canal |

### Permissões por canal

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/channels/{channelId}/permissions` | Listar overrides do canal |
| PUT | `/api/channels/{channelId}/permissions` | Definir override (ler/escrever/gerenciar) |
| DELETE | `/api/channels/{channelId}/permissions/{userId}` | Remover override |

### Mensagens

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/channels/{id}/messages` | Listar mensagens (paginação) |
| GET | `/api/channels/{id}/messages/search?q=` | Buscar no canal |
| POST | `/api/channels/{id}/messages` | Enviar mensagem |
| PUT | `/api/messages/{id}` | Editar mensagem |
| DELETE | `/api/messages/{id}` | Excluir mensagem |

### Anexos

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/attachments` | Upload de arquivo (multipart, máx. 50MB) |
| DELETE | `/api/attachments/{id}` | Excluir anexo |

### Arquivos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/files/{key}` | Servir arquivo — `inline` por padrão; `?download=true` força download |

### LiveKit

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/livekit/token` | Gerar token de entrada na chamada (valida permissão do canal) |
| GET | `/api/livekit/voice-state` | Snapshot atual de quem está nos canais de voz |
| POST | `/api/livekit/webhook` | Webhook do LiveKit (autenticado por JWT + SHA-256) — uso interno do LiveKit |

## Build para Produção

### Web (frontend)

```bash
cd frontend
npm run build    # gera dist/
```

### Desktop (Linux AppImage)

```bash
cd desktop
npm run build    # builda o frontend e gera release/ via electron-builder
```

## Testes

### Backend

```bash
cd backend
./gradlew test
```

### Frontend

```bash
cd frontend
npm run build
```

## Tecnologias

- **Desktop:** Electron
- **Frontend:** Vue 3, TypeScript, Pinia, Element Plus
- **Backend:** Spring Boot 3, Groovy, MyBatis
- **Banco:** PostgreSQL
- **Cache:** Redis
- **Mídia:** LiveKit, WebRTC (voz, vídeo e compartilhamento de tela), Krisp (supressão de ruído)
- **Armazenamento:** Garage (S3-compatible)
- **Comunicação em tempo real:** WebSocket/STOMP
- **Infra:** Docker Compose, Caddy (TLS automático), nginx

## Licença

Projeto privado.
