import { lazy } from 'react';

export const Quotes = lazy(() => import('@/pages/Quotes'));
export const CreateQuote = lazy(() => import('@/pages/CreateQuote'));
export const EditQuote = lazy(() => import('@/pages/EditQuote'));
export const QuoteViewPage = lazy(() => import('@/pages/QuoteViewPage'));
export const SharedQuote = lazy(() => import('@/pages/SharedQuote'));
