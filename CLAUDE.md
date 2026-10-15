# Claude Instructions for Ledger Craft App

## Reconstruction (read first)

The hosted `public` schema is empty. Rebuild toward `TARGET_ARCHITECTURE.md`. Do not replay `supabase/migrations` or `migrations/*.sql`.

1. `.cursor/skills/ledgercraft-bootstrap/SKILL.md` — current wave, next command, hard no
2. `AGENTS.md` — file map, commands, specialist roster
3. Matching skill in `.cursor/skills/ledgercraft-*`

**Now:** W1–W13 verified. Web Hono covers customers, business profile, items, invoices (send + remind), expenses, payments, accounts list/write, journals, bank accounts, transaction import, reconciliation persist, tax, objects, payment receipts, receipt-scan, conversations, and chat. Live auth routes are Better Auth only. `@supabase/supabase-js` is not installed. Next: TanStack Router / `apps/`. Pickup: `AGENTS.md` § Reconstruction agents. Postgres host port **55432**. API **3001**. Vite **8080**.

New domain work goes through Hono (`api/`), not new `supabase.from` / Storage / Edge Functions / client OpenAI.

## Project Overview
Ledger Craft is a modern PWA expense tracking application built with React, TypeScript, and Supabase. The app helps users manage expenses, create invoices, and track financial data. Clients talk to the Hono API (`api/`); hosted Supabase is gone.

## Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **State Management**: React Context/Hooks
- **Routing**: React Router
- **Build Tool**: Vite
- **Testing**: Jest, React Testing Library
- **Deployment**: Vercel/Netlify

## Development Guidelines

### Code Style
- Use TypeScript for all new files
- Follow React functional components with hooks
- Use Tailwind CSS for styling
- Prefer composition over inheritance
- Use descriptive variable and function names

### File Structure
```
src/
├── components/     # Reusable UI components
├── pages/         # Route components
├── hooks/         # Custom React hooks
├── services/      # API and external service calls
├── types/         # TypeScript type definitions
├── utils/         # Utility functions
├── contexts/      # React contexts
└── assets/        # Static assets
```

### Component Patterns
- Use functional components with TypeScript interfaces
- Implement proper prop typing
- Use custom hooks for logic reuse
- Follow the single responsibility principle
- Implement proper error boundaries

### State Management
- Use React Context for global state
- Prefer local state with useState when possible
- Use useReducer for complex state logic
- Implement proper loading and error states

### Supabase Integration
- Use Supabase client for database operations
- Implement Row Level Security (RLS) policies
- Use real-time subscriptions where appropriate
- Handle authentication state properly

### Testing Strategy
- Write unit tests for utility functions
- Test components with React Testing Library
- Mock external dependencies
- Test user interactions and edge cases

### Performance Optimization
- Use React.memo for expensive components
- Implement proper code splitting
- Optimize bundle size with tree shaking
- Use proper loading states and skeleton screens

## Development Commands
```bash
# Development
npm run dev

# Build
npm run build

# Test
npm test

# Lint
npm run lint

# Type check
npm run type-check
```

## Key Features to Maintain
1. **Expense Tracking**: Add, edit, delete expenses
2. **Invoice Generation**: Create and manage invoices
3. **PWA Support**: Offline functionality and app installation
4. **Authentication**: Secure user login/logout
5. **Responsive Design**: Mobile-first approach
6. **Real-time Updates**: Live data synchronization

## AI Development Best Practices
1. Always check existing patterns before creating new ones
2. Maintain consistency with current codebase
3. Implement proper TypeScript typing
4. Add appropriate error handling
5. Follow accessibility guidelines
6. Ensure mobile responsiveness
7. Test on multiple devices/browsers

## Database Schema Considerations
- Follow Supabase naming conventions
- Implement proper foreign key relationships
- Use UUIDs for primary keys
- Add proper indexes for performance
- Implement audit trails where needed

## Security Guidelines
- Never expose sensitive data
- Implement proper input validation
- Use environment variables for secrets
- Follow OWASP security practices
- Implement proper CORS policies

## Deployment Notes
- Use environment variables for configuration
- Implement proper error tracking
- Set up CI/CD pipelines
- Monitor performance metrics
- Implement proper backup strategies

## MCP Server
- User supabase MCP server for supabase communication
- Use Playwright MCP server for Testing

## UI inspirations
 - You may refer to images under screens folder for UI inspirations. make it clean and follow simillar standards. 