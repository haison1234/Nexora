<p align="center">
  <img src="assets/nexora-banner.png" alt="Nexora — a cozy home for your AI team" width="100%" />
</p>

<h1 align="center">Nexora</h1>

<p align="center">
  <strong>A cozy home for your AI team.</strong>
</p>

<p align="center">
  <a href="https://n8n.io/"><img src="https://img.shields.io/badge/n8n-workflows-55D6D0?style=for-the-badge&logo=n8n&logoColor=white" alt="Built on n8n" /></a>
  <img src="https://img.shields.io/badge/Multi--Agent-AI%20Department-BD8CFF?style=for-the-badge" alt="Multi-Agent AI Department" />
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/Open%20Source-license%20notices-64A9E8?style=for-the-badge&logo=github&logoColor=white" alt="Open source with license notices" /></a>
</p>

<p align="center">
  <strong>Nexora connects AI departments, people, workflows, and execution runtimes in one operating platform.</strong>
</p>

Nexora is an experimental, self-hostable AI operations platform built on the n8n codebase. It combines n8n workflow automation with an AI Department layer for organizing departments, members, goals, and work. The name Nexora suggests connection, a future-facing platform, and an ecosystem of AI capabilities.

> **Project status:** Nexora is under active development. It is not a production-ready release. AI Department contracts and features are being implemented in dependency order. Some coordination, execution recovery, workflow bridge, review, and live-update capabilities remain incomplete. See [AI Department status](#ai-department-status).

## Contents

- [What Nexora does](#what-nexora-does)
- [AI Department status](#ai-department-status)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Install for development](#install-for-development)
- [Run Nexora locally](#run-nexora-locally)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Roadmap and specifications](#roadmap-and-specifications)
- [Contributing](#contributing)
- [License](#license)
- [Nexora bằng tiếng Việt](#nexora-bằng-tiếng-việt)

## What Nexora does

Nexora aims to give teams one place to manage AI department operations while using n8n workflows and authorized agent runtimes as tools.

- **Departments and members:** organize AI workers by department, role, and reporting relationship.
- **Goals and work:** connect goals to assigned work and track work status.
- **Agent execution:** connect a department member to an available n8n Agent or another supported runtime through a verified binding.
- **Review and activity:** inspect work history and make business-result decisions separately from runtime tool approvals.
- **Workflow automation:** use n8n workflows and integrations as capabilities for department work.
- **Self-hosting:** run the development version on your own computer. Deployment packaging for Nexora is not yet published.

Nexora keeps a department member's identity separate from the runtime that executes its work. Runtime credentials, prompts, checkpoints, and execution records stay with their owning runtime. A workflow or agent is an authorized tool; it is not the department itself.

## AI Department status

Feature work follows the contract and acceptance records in [`specs/feature-contracts/ai-department/`](specs/feature-contracts/ai-department/README.md). Source code existing in the repository does not mean that its behavior has passed runtime acceptance.

| Area | Current status |
| --- | --- |
| Directory (departments, members, roles, and bindings) | C1 contract and acceptance are closed for the current revision. |
| Goals, work, and coordination | C2 is in progress. Planning and the assigned-work inbox exist. Wake coalescing, handoff, and other acceptance remain open. |
| Agent execution and recovery | C3 remains open. Owner-controlled stop and recovery acceptance are not complete. |
| Business review | C4 remains open. Review-stage and reviewer-authority work is not complete. |
| Workflow bridge | C5 remains open. The department workflow invocation contract is not complete. |
| Operations UI and live updates | C6 remains open. The 2D UI is in progress; live push acceptance is not complete. |

See the [AI Department roadmap](specs/AI-DEPARTMENT-ROADMAP.md), the [Feature Contract](specs/feature-contracts/ai-department/README.md), and the detailed [progress report](specs/AI-DEPARTMENT-PROGRESS-REPORT-2026-11-03.md).

## Architecture

Nexora extends the n8n monorepo. The main application uses a Node.js and TypeScript backend, a Vue 3 editor, and a pnpm workspace. AI Department backend code lives in the CLI module. Its UI lives in a frontend module. Shared request and response types live in `packages/@n8n/api-types`.

```text
Nexora / n8n project shell
├── n8n workflows and integrations
├── n8n Agents and runtime owners
└── AI Department
    ├── Departments and members
    ├── Goals and work coordination
    ├── Execution and business review
    └── Operations interface
```

The current implementation uses n8n project access for data and actions. It uses n8n's module, database, API, frontend, and design-system patterns. Read [the shared design](specs/AI-DEPARTMENT-DESIGN.md) for the intended product boundaries.

## Requirements

- macOS, Linux, or Windows through WSL2
- Git
- Node.js **24 or later**
- pnpm **12.4.2** (the repository pins this version)
- Docker for database schema generation and some integration or end-to-end checks

Use the Node.js and pnpm versions required by the root `package.json` and `packageManager` fields. The repository is large. A full install and build need several gigabytes of memory and disk space.

## Install for development

1. Create a GitHub repository named `Nexora` and push this source to it. Then clone your repository:

   ```bash
   git clone https://github.com/<your-github-name>/Nexora.git
   cd Nexora
   ```

   If you are working from the original local checkout, skip the clone step.

2. Install workspace dependencies:

   ```bash
   pnpm install
   ```

3. Build the workspace:

   ```bash
   pnpm build
   ```

The build can take several minutes. For a fresh checkout, the repository also provides `pnpm agent:setup`, which runs setup steps and writes logs under `.agent-setup/`.

## Run Nexora locally

### Backend

Start the n8n backend from the repository root:

```bash
pnpm dev:be
```

### Editor frontend

In a second terminal, start the editor development server:

```bash
pnpm dev:fe:editor
```

Open **http://localhost:5678**. The backend uses port `5678` by default. The editor dev server uses port `8080` and connects to the backend. Create or sign in to a local n8n user, open a project, and select **AI Department** in the project navigation.

To move the backend to another port, set the same backend port for both commands. For example:

```bash
N8N_PORT=5699 pnpm dev:be
N8N_PORT=5699 N8N_EDITOR_PORT=8082 pnpm dev:fe:editor
```

The AI Department data is stored by the local n8n database. Keep the same local user folder and database when restarting the development instance. Do not delete them if you need to keep local test data.

### Local environment file

Most development settings have defaults. Create a local environment file only when you need to change them:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`, then load it when starting the backend:

```bash
pnpm exec dotenvx run -f .env.local -- pnpm dev:be
```

Do not commit `.env.local` or put API keys, passwords, or other secrets in this README. The example file documents common local settings. See the [n8n configuration reference](https://docs.n8n.io/hosting/configuration/) for available environment variables.

## Configuration

Nexora currently uses n8n configuration and local development defaults. Key settings include:

| Setting | Purpose | Default / example |
| --- | --- | --- |
| `N8N_PORT` | Backend HTTP port | `5678` |
| `N8N_EDITOR_PORT` | Frontend development server port | `8080` |
| `N8N_USER_FOLDER` | Local user data and database folder | n8n default; set a dedicated path to isolate development data |

AI providers, credentials, and runtime bindings need separate configuration in their owning n8n feature. Do not assume that adding an AI Department member automatically configures an AI model or runtime.

## Project structure

```text
packages/
├── @n8n/api-types/                 Shared API types
├── cli/src/modules/ai-department/  AI Department backend
├── cli/src/modules/agents/         Agent runtime and owner integration
├── frontend/editor-ui/             n8n editor application
└── modules/ai-department/frontend/  AI Department UI module
specs/
├── AI-DEPARTMENT-ROADMAP.md        Dependency-ordered roadmap
├── AI-DEPARTMENT-DESIGN.md         Shared interface design
├── feature-contracts/ai-department/ Accepted feature contracts and evidence
└── 00*-ai-department-*/             Feature specifications
```

## Roadmap and specifications

The AI Department work is split into feature specifications and dependency-ordered contracts. Read these before changing the feature:

1. [Roadmap](specs/AI-DEPARTMENT-ROADMAP.md)
2. [Shared design](specs/AI-DEPARTMENT-DESIGN.md)
3. [Feature Contract index](specs/feature-contracts/ai-department/README.md)
4. [Source and acceptance evidence](specs/feature-contracts/ai-department/evidence.md)

Paperclip is used as a business-behavior reference in the research. Its schema and architecture are not the target design. See the [Paperclip parity review](specs/AI-DEPARTMENT-PAPERCLIP-PARITY-REVIEW.md).

## Contributing

Contributions are welcome. Before making a change:

1. Read [`AGENTS.md`](AGENTS.md) and the instructions for the package you will change.
2. Read the relevant feature specification, contract, and task list.
3. Keep API types, backend behavior, frontend behavior, and acceptance evidence in sync.
4. Use pnpm and run the focused checks for the files you changed.
5. Do not mark a feature complete until its required acceptance checks pass.

For general n8n development setup and contribution rules, see [`CONTRIBUTING.md`](CONTRIBUTING.md). Do not submit secrets, local databases, build output, or user data.

## License

Nexora is based on n8n. The source includes n8n code and dependencies that are subject to their existing license terms. Review [`LICENSE.md`](LICENSE.md), [`LICENSE_EE.md`](LICENSE_EE.md), and third-party notices before you publish or distribute a fork. This README does not grant rights to relicense the upstream n8n code. Keep applicable copyright and license notices.

## Nexora bằng tiếng Việt

**Nexora kết nối các phòng ban AI, con người, workflow và môi trường thực thi trong một nền tảng vận hành.**

Nexora là dự án thử nghiệm, có thể tự host và được xây dựng trên mã nguồn n8n. Dự án kết hợp tự động hóa workflow của n8n với lớp AI Department để tổ chức phòng ban, thành viên, mục tiêu và công việc. Tên Nexora gợi ý sự kết nối, định hướng tương lai và một hệ sinh thái AI.

### Tính năng hướng tới

- Tổ chức phòng ban, vai trò, thành viên và quan hệ quản lý.
- Tạo mục tiêu, giao việc và theo dõi trạng thái công việc.
- Liên kết thành viên với n8n Agent hoặc runtime khác thông qua binding được xác minh.
- Theo dõi lịch sử và duyệt kết quả công việc; tách việc duyệt kết quả khỏi quyền phê duyệt công cụ runtime.
- Dùng workflow và integration của n8n làm công cụ cho công việc của phòng ban.
- Chạy môi trường phát triển trên máy cá nhân.

### Trạng thái

Nexora vẫn đang được phát triển và **chưa sẵn sàng cho production**. Hợp đồng C1 cho directory đã qua nghiệm thu ở revision hiện tại. C2 đang triển khai; inbox đã có nhưng handoff và wake coalescing chưa hoàn tất. Execution/recovery, các stage review, workflow bridge và live updates vẫn còn mở. Xem [roadmap](specs/AI-DEPARTMENT-ROADMAP.md) và [Feature Contract](specs/feature-contracts/ai-department/README.md) để biết trạng thái mới nhất.

### Cài đặt môi trường phát triển

Yêu cầu Git, Node.js 24 trở lên, pnpm 12.4.2 và Docker cho một số kiểm tra.

```bash
git clone https://github.com/<ten-github-cua-ban>/Nexora.git
cd Nexora
pnpm install
pnpm build
```

Mở hai terminal tại thư mục dự án. Chạy backend ở terminal thứ nhất:

```bash
pnpm dev:be
```

Chạy editor ở terminal thứ hai:

```bash
pnpm dev:fe:editor
```

Mở **http://localhost:5678**, đăng nhập vào user cục bộ, mở một project và chọn **AI Department**. Dữ liệu phát triển nằm trong thư mục dữ liệu của n8n. Hãy dùng cùng user folder và database giữa các lần chạy nếu muốn giữ dữ liệu.

Có thể tạo file cấu hình local bằng `cp .env.local.example .env.local`. Không commit file này nếu nó có chứa secret. Backend mặc định dùng cổng `5678`; frontend dev server mặc định dùng cổng `8080`.

### Giấy phép

Nexora dựa trên n8n. Mã nguồn và dependency kế thừa điều khoản giấy phép tương ứng. Trước khi công khai hoặc phân phối fork, hãy đọc [`LICENSE.md`](LICENSE.md), [`LICENSE_EE.md`](LICENSE_EE.md) và các thông báo bản quyền liên quan. README này không cấp quyền đổi giấy phép cho mã nguồn n8n.
