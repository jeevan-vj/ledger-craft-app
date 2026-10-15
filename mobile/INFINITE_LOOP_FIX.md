# Infinite Loop Fix - Root Cause Analysis

## Problem
"The result of getSnapshot should be cached to avoid an infinite loop"

## Root Cause
The `useAuth()` selector hook was creating a **new object on every render**:

```typescript
// ❌ BAD - Creates new object every time
export const useAuth = () => useStore((state) => ({
  user: state.user,
  session: state.session,
  // ... more fields
}));
```

This caused:
1. Component renders → calls `useAuth()`
2. `useAuth()` returns new object (different reference)
3. React detects change → re-renders component
4. Go to step 1 → **infinite loop**

## Solution Applied

### 1. Added shallow comparison to `useAuth()` hook
```typescript
import { shallow } from 'zustand/shallow';

export const useAuth = () => useStore((state) => ({
  user: state.user,
  session: state.session,
  // ...
}), shallow); // ✅ Now compares values, not object reference
```

### 2. Use individual selectors in components
```typescript
// ✅ BETTER - Each selector subscribes to specific value
const user = useStore((state) => state.user);
const loading = useStore((state) => state.loading);
```

### 3. Removed dependencies from useEffect
```typescript
useEffect(() => {
  if (!initializedRef.current) {
    initializedRef.current = true;
    initialize();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // ✅ Empty deps - runs once
```

### 4. Module-level flag for auth listener
```typescript
let authListenerInitialized = false; // ✅ Ensures listener setup once

if (!authListenerInitialized) {
  authListenerInitialized = true;
  supabase.auth.onAuthStateChange(...);
}
```

### 5. Duplicate detection in auth state handler
```typescript
if (event === 'INITIAL_SESSION' && currentState.session?.access_token === session?.access_token) {
  return; // ✅ Skip if same session
}
```

## Files Changed
- `mobile/src/store/index.ts` - Added shallow comparison
- `mobile/src/store/authSlice.ts` - Module flag + duplicate detection
- `mobile/src/navigation/index.tsx` - Individual selectors + empty deps
- `mobile/src/navigation/AuthNavigator.tsx` - Individual selectors + useMemo

## Result
✅ No infinite loop
✅ Auth initializes once
✅ Components render efficiently
✅ Login screen loads properly

