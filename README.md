# Draftly - AI-Powered Architectural CAD Platform

Draftly is an AI-powered architectural floor plan generator that converts natural language descriptions into precise 2D CAD drawings with full editing capabilities and DXF export.

## Features

- **Text to Floor Plan**: Describe your building in plain language and AI generates the layout
- **Smart Room Placement**: Constraint-based layout with proper adjacency rules and zoning logic
- **Full CAD Toolkit**: Edit plans with lines, arcs, text, dimensions, layers, and undo/redo
- **DXF Export**: Industry-standard export compatible with AutoCAD and professional workflows
- **Electrical & Plumbing Layers**: Toggleable MEP layers with rational placement
- **Multi-Floor Support**: Generate plans for multi-story buildings
- **User Authentication**: Secure signup/login with per-user saved projects

## Architecture

```
draftly/
├── backend/                 # Python FastAPI backend
│   ├── main.py              # Application entry point
│   ├── database.py          # SQLAlchemy database configuration
│   ├── models/              # Pydantic schemas and DB models
│   ├── routers/             # API route handlers
│   │   ├── auth.py          # Authentication endpoints
│   │   ├── projects.py      # User projects CRUD
│   │   ├── generate.py      # Floor plan generation
│   │   └── export.py        # DXF/SVG export
│   ├── services/            # Business logic
│   │   ├── auth_service.py  # JWT auth and user management
│   │   ├── layout_algorithm.py  # Room placement engine
│   │   ├── topology_agent.py    # Zone classification
│   │   ├── element_generator.py # CAD primitives
│   │   ├── electrical_service.py # Electrical layer
│   │   ├── plumbing_service.py   # Plumbing layer
│   │   ├── dxf_service.py   # DXF file generation
│   │   └── layout_validator.py  # Layout validation
│   └── tests/               # Automated tests
│
├── frontend/                # React + Vite frontend
│   ├── src/
│   │   ├── main.jsx         # App entry with routing
│   │   ├── App.jsx          # CAD editor component
│   │   ├── pages/           # Page components
│   │   │   ├── LandingPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   └── SignupPage.jsx
│   │   ├── contexts/        # React contexts
│   │   │   └── AuthContext.jsx
│   │   └── services/        # API client
│   │       └── api.js
│   └── index.html
│
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

5. Edit `.env` and set required values:
   - `GOOGLE_API_KEY`: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - `JWT_SECRET_KEY`: Generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`

6. Start the backend server:
   ```bash
   python main.py
   ```
   
   Or with uvicorn:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file (optional):
   ```bash
   echo "VITE_API_URL=http://localhost:8000" > .env
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:5173 in your browser

### Running Tests

```bash
cd backend
pytest tests/ -v
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | Yes | Google AI API key for Gemini |
| `JWT_SECRET_KEY` | Yes | Secret key for JWT token signing |
| `DATABASE_URL` | No | Database connection URL (default: SQLite) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | JWT token expiration (default: 1440) |
| `FRONTEND_ORIGINS` | No | Comma-separated CORS origins |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | No | Backend API URL (default: http://localhost:8000) |

## Deployment

### Frontend (Vercel)

1. Connect your repository to Vercel
2. Set the root directory to `frontend`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Set environment variables:
   - `VITE_API_URL`: Your backend URL

### Backend (Railway/Render/Fly.io)

1. Set the root directory to `backend`
2. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Set environment variables:
   - `GOOGLE_API_KEY`
   - `JWT_SECRET_KEY`
   - `DATABASE_URL` (if using PostgreSQL)
   - `FRONTEND_ORIGINS` (your frontend domain)

### DNS Configuration (draftly.site)

If deploying to draftly.site:

1. Point the domain A record to your frontend host (Vercel)
2. Configure the backend subdomain (e.g., api.draftly.site)
3. Update `VITE_API_URL` to point to the backend subdomain
4. Update `FRONTEND_ORIGINS` to include the main domain

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/logout` - Logout (client-side)
- `POST /api/auth/waitlist` - Join beta waitlist

### Projects

- `GET /api/projects/` - List user's projects
- `POST /api/projects/` - Create new project
- `GET /api/projects/{id}` - Get project details
- `PUT /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project

### Drawings

- `POST /api/projects/{id}/drawings` - Create drawing
- `GET /api/projects/{id}/drawings/{did}` - Get drawing
- `PUT /api/projects/{id}/drawings/{did}` - Update drawing
- `DELETE /api/projects/{id}/drawings/{did}` - Delete drawing

### Generation

- `POST /api/chat` - Generate floor plan from prompt
- `WS /api/ws/{session_id}` - WebSocket for real-time generation

### Export

- `GET /static/downloads/{job_id}.dxf` - Download DXF file

## Layers

The generated floor plans include the following layers:

| Layer | Description | Toggle |
|-------|-------------|--------|
| Walls | Exterior and interior walls | Always on |
| Doors | Door openings with swing arcs | Always on |
| Windows | Window openings | Always on |
| Dimensions | Room measurements | Always on |
| Furniture | Beds, sofas, tables, etc. | Optional |
| Electrical | Outlets, switches, lights, wiring | Optional |
| Plumbing | Water supply, drainage, fixtures | Optional |

## License

MIT License - See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## Support

For issues and feature requests, please use the GitHub Issues page.
