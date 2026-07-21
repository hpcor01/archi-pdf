# Αρχή PDF

> **Αρχή** *(do grego: origem, começo)* — Uma ferramenta moderna para montar, editar e exportar documentos PDF diretamente no navegador, sem instalar nada.

![Versão](https://img.shields.io/badge/versão-2.9.1-emerald)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)
![Vite](https://img.shields.io/badge/Vite-5-purple)
![Deploy](https://img.shields.io/badge/deploy-Vercel-black)

---

## ✨ O que é

**Αρχή PDF** é um editor de documentos PDF 100% client-side (sem backend) que roda diretamente no navegador. Com ele você pode:

- Organizar imagens e PDFs em colunas (documentos separados)
- Editar, recortar e rotacionar imagens antes de exportar
- Remover fundo de imagens automaticamente com OpenCV.js
- Mesclar múltiplas fontes (imagens + PDFs) em um único arquivo PDF
- Exportar com ou sem compressão ajustável
- Aplicar OCR (reconhecimento de texto) para PDFs pesquisáveis
- Dividir páginas de PDF em novos documentos

Tudo isso sem enviar nenhum arquivo para um servidor.

---

## 🚀 Funcionalidades

| Recurso | Descrição |
|---|---|
| 📁 **Colunas de documento** | Múltiplos PDFs independentes montados em colunas lado a lado |
| 🖼️ **Editor de imagem** | Crop manual, rotação, zoom e reset ao original |
| 📄 **Editor de PDF** | Visualização por página, rotação vetorial e divisão de páginas |
| ✂️ **Auto-recorte** | Remoção inteligente de fundo com OpenCV.js |
| 🔍 **OCR** | Texto invisível embutido no PDF para busca, via Tesseract.js |
| 🗜️ **Compressão ajustável** | Slider para balancear qualidade × tamanho do arquivo |
| 📦 **Exportação em ZIP** | Baixe todos os PDFs de uma vez em um arquivo compactado |
| 🌙 **Tema escuro / claro** | Alterna e persiste via `localStorage` |
| 🌐 **Idiomas** | Suporte a Português (pt-BR) e Inglês (en-US) |
| ⌨️ **Atalhos de teclado** | `Ctrl+S` para salvar, `Ctrl+V` para colar imagens |
| 🔔 **Notificação de atualização** | Detecta nova versão publicada e avisa sem forçar reload |

---

## 🛠️ Stack

- **[React 18](https://react.dev/)** + **[TypeScript 5](https://www.typescriptlang.org/)** — UI e lógica da aplicação
- **[Vite 5](https://vitejs.dev/)** — Build tool e dev server
- **[Tailwind CSS 3](https://tailwindcss.com/)** — Estilização utility-first
- **[@dnd-kit](https://dndkit.com/)** — Drag-and-drop de itens entre colunas
- **[Lucide React](https://lucide.dev/)** — Ícones SVG

### Bibliotecas externas (via CDN)

| Biblioteca | Uso |
|---|---|
| [PDF-lib](https://pdf-lib.js.org/) | Criação e manipulação de PDFs |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Renderização de páginas de PDF como imagens |
| [Tesseract.js](https://tesseract.projectnaptha.com/) | OCR para texto pesquisável no PDF |
| [OpenCV.js](https://docs.opencv.org/4.x/opencv.js) | Auto-recorte e remoção de fundo |
| [JSZip](https://stuk.github.io/jszip/) | Exportação de múltiplos PDFs em ZIP |

---

## ⚙️ Como rodar localmente

### Pré-requisitos

- [Node.js](https://nodejs.org/) 18+
- npm 9+

### Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/archi-pdf.git
cd archi-pdf

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

Acesse **http://localhost:5173** no navegador.

### Scripts disponíveis

```bash
npm run dev       # Inicia o servidor de desenvolvimento
npm run build     # Gera o bundle de produção em /dist
npm run preview   # Visualiza o build de produção localmente
npm run lint      # Executa o ESLint
```

---

## 🚢 Deploy

O projeto está configurado para deploy na **[Vercel](https://vercel.com/)**.

O arquivo `vercel.json` já contém a regra de rewrite necessária para o roteamento funcionar corretamente em SPAs:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Para fazer o deploy:

1. Conecte o repositório à sua conta na Vercel
2. As configurações padrão de framework (Vite) são detectadas automaticamente
3. Faça o push para a branch principal — o deploy acontece automaticamente

---

## 📁 Estrutura do projeto

```
archi-pdf/
├── components/
│   ├── DocumentColumn.tsx      # Coluna de documentos (drag-and-drop)
│   ├── EditorModal.tsx         # Modal de edição de imagens
│   ├── PdfEditorModal.tsx      # Modal de edição de PDFs
│   ├── TopBar.tsx              # Barra de ferramentas principal
│   ├── Toast.tsx               # Notificações de feedback
│   └── UpdateNotification.tsx  # Aviso de nova versão disponível
├── services/
│   ├── pdfService.ts           # Geração e exportação de PDFs
│   ├── pdfCacheService.ts      # Cache de PDFs via IndexedDB
│   └── cvService.ts            # Auto-recorte com OpenCV.js
├── App.tsx                     # Componente raiz e orquestração de estado
├── constants.ts                # Traduções, configurações iniciais e temas
├── types.ts                    # Tipos TypeScript globais
├── index.tsx                   # Entry point da aplicação React
├── index.html                  # HTML raiz com CDN scripts
├── vite.config.ts              # Configuração do Vite
└── vercel.json                 # Configuração de deploy na Vercel
```

---

## 🖥️ Uso rápido

1. **Adicione arquivos**: Clique em uma coluna ou arraste imagens/PDFs diretamente
2. **Organize**: Reordene itens com drag-and-drop entre colunas
3. **Edite**: Clique no ícone de edição de um item para abrir o editor
4. **Auto-recorte**: Use o botão na TopBar para remover fundos em lote
5. **Configure**: Ajuste a qualidade de compressão, ative OCR, escolha salvar separado ou em ZIP
6. **Exporte**: `Ctrl+S` ou clique em "Salvar PDF"

---

## ⌨️ Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl + S` | Salvar / exportar PDFs selecionados |
| `Ctrl + V` | Colar imagem da área de transferência |

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Faça um **fork** do repositório
2. Crie uma branch: `git checkout -b feature/minha-feature`
3. Faça seus commits: `git commit -m 'feat: adiciona minha feature'`
4. Envie para a branch: `git push origin feature/minha-feature`
5. Abra um **Pull Request**

---

## 📄 Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.

---

## 🙏 Agradecimentos

Este projeto faz uso das seguintes bibliotecas open-source:

- [PDF-lib](https://pdf-lib.js.org/) — Mozilla Public License 2.0
- [PDF.js](https://mozilla.github.io/pdf.js/) — Apache License 2.0
- [Tesseract.js](https://tesseract.projectnaptha.com/) — Apache License 2.0
- [OpenCV.js](https://opencv.org/license/) — Apache License 2.0
- [Lucide Icons](https://lucide.dev/license) — ISC License

---

<p align="center">
  <strong>Αρχή PDF</strong> © 2026 — Αρχή · <em>Desenvolvido por L. Stivan e Hugo Cordeiro.</em>
</p>
