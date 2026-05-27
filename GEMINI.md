# Project Overview

This project is a web-based, dual-pane file manager called "SSH-Commander". It provides a user interface similar to Total Commander, allowing users to manage files on both their local machine and remote servers via SSH/SFTP. The application is built with a modern tech stack, featuring a React frontend and a Node.js (Express) backend, both written in TypeScript.

## Key Technologies

*   **Frontend:** React, Vite, Tailwind CSS
*   **Backend:** Node.js, Express, TypeScript
*   **Real-time Updates:** None
*   **SSH/SFTP:** `ssh2` library
*   **Cloud Integration:** Google Drive (partially implemented)

## Architecture

The application is divided into a client-side frontend and a server-side backend.

*   **Backend (`server.ts`):** An Express server that handles all file system operations. It has separate API endpoints for local and remote (SSH/SFTP) operations, including file listing, reading, writing, creating, deleting, and renaming. It also manages a pool of SSH connections to handle multiple sessions.
*   **Frontend (`src/App.tsx`):** A single-page application built with React. It provides the dual-pane UI and manages the application state, including the files and directories in each pane, the active SSH connections, and the various modals for file viewing, editing, and terminal access. It communicates with the backend via a REST API.

# Building and Running

## Prerequisites

*   Node.js and npm

## Installation

1.  Install the dependencies:
    ```bash
    npm install
    ```

## Running the Application

1.  **Development Mode:**
    To run the application in development mode with hot-reloading, use the following command:
    ```bash
    npm run dev
    ```
    This will start the Express server and the Vite development server.

2.  **Production Mode:**
    To build the application for production, use the following command:
    ```bash
    npm run build
    ```
    This will create a `dist` directory with the optimized frontend assets and the compiled backend server.

    To run the application in production mode, use the following command:
    ```bash
    npm run start
    ```

## Testing

There are no explicit test scripts defined in `package.json`.

# Development Conventions

*   **Code Style:** The project uses TypeScript for both the frontend and backend. The code is well-structured and follows modern JavaScript/TypeScript conventions.
*   **Linting:** The `lint` script in `package.json` runs the TypeScript compiler with the `--noEmit` flag to check for type errors.
*   **State Management:** The frontend uses React's built-in state management (`useState`, `useEffect`, `useCallback`, `useMemo`) to manage the application state.
*   **API:** The frontend communicates with the backend via a REST API. All API endpoints are defined in `server.ts`.
