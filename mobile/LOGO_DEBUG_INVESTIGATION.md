# Logo Display Debug Investigation

## Issue
Logo uploads successfully but doesn't display after saving and reloading the Business Settings page.

## Debug Changes Added

### 1. BusinessProfileService Logging
**File**: `mobile/src/services/businessProfileService.ts`

Added console logs in `transformToBusinessProfile()`:
```typescript
console.log('📸 Raw data from database:', data);
console.log('📸 logo_url from database:', data.logo_url);
// ... transformation ...
console.log('📸 Transformed profile.logoUrl:', profile.logoUrl);
```

### 2. BusinessSettingsScreen Logging
**File**: `mobile/src/screens/settings/BusinessSettingsScreen.tsx`

Added console logs in multiple locations:

**In `loadProfile()`**:
```typescript
console.log('📸 Loaded profile data:', data);
console.log('📸 Logo URL from database:', data?.logoUrl);
```

**In `populateForm()`**:
```typescript
const logoUrl = data.logoUrl || null;
console.log('📸 Setting logoUri to:', logoUrl);
setLogoUri(logoUrl);
```

**In Image component**:
```typescript
<Image 
  key={logoUri}  // Force re-render when URI changes
  source={{ uri: logoUri }} 
  style={styles.logoImage}
  onError={(error) => console.error('📸 Image load error:', error.nativeEvent)}
  onLoad={() => console.log('📸 Image loaded successfully:', logoUri)}
/>
```

## What to Check Next

### Step 1: Upload Logo Again
1. Open the Business Settings screen
2. Tap "Tap to upload" 
3. Select/capture an image
4. Tap "Save Changes"
5. Wait for "Success" message

### Step 2: Check Console Logs
Look for these logs in sequence:

#### After Upload (Before Save):
```
📸 Image loaded successfully: file:///path/to/local/image.jpg
```

#### After Save:
```
(Upload process logs from businessProfileService.uploadLogo)
```

#### After Reload:
```
📸 Raw data from database: { ..., logo_url: 'https://...', ... }
📸 logo_url from database: https://supabase.co/.../logo.jpg
📸 Transformed profile.logoUrl: https://supabase.co/.../logo.jpg
📸 Loaded profile data: { ..., logoUrl: 'https://...', ... }
📸 Logo URL from database: https://supabase.co/.../logo.jpg
📸 Setting logoUri to: https://supabase.co/.../logo.jpg
📸 Image loaded successfully: https://supabase.co/.../logo.jpg
```

### Possible Issues to Identify

#### Issue 1: Logo URL is NULL in Database
If you see:
```
📸 logo_url from database: null
```
**Problem**: Logo not being saved to database
**Solution**: Check uploadLogo() function and database update query

#### Issue 2: Logo URL is Correct but Image Fails to Load
If you see:
```
📸 Setting logoUri to: https://supabase.co/.../logo.jpg
📸 Image load error: [error details]
```
**Problem**: Image URL is invalid or inaccessible
**Solutions**:
- Check Supabase Storage bucket permissions (should be public)
- Verify the URL is accessible in a browser
- Check CORS settings in Supabase

#### Issue 3: State Not Updating
If logoUri state isn't being set:
```
📸 Setting logoUri to: https://...
(but Image component shows placeholder)
```
**Problem**: React state update issue
**Solution**: Already added `key={logoUri}` to force re-render

#### Issue 4: Image Component Not Rendering
If you don't see any Image load logs:
**Problem**: Component conditional rendering issue
**Solution**: Check if `logoUri` is truthy

## How to View Console Logs

### Expo Go / Development Build:
1. In terminal where you ran `npm start` or `expo start`
2. Logs will appear automatically
3. Look for 📸 emoji to find logo-related logs

### React Native Debugger:
1. Shake device / Ctrl+M (Android) / Cmd+D (iOS)
2. Select "Debug Remote JS"
3. Open Chrome DevTools Console
4. Look for 📸 emoji logs

### VS Code Console:
If running through VS Code, logs appear in the Debug Console.

## Expected Flow

```
User Selects Image
    ↓
Local file URI set to logoUri state
    ↓
Image displays (local file)
    ↓
User taps Save
    ↓
uploadLogo() uploads to Supabase Storage
    ↓
Returns public URL (e.g., https://...supabase.co/.../logo.jpg)
    ↓
updateBusinessProfile() saves URL to database (logo_url column)
    ↓
Success message
    ↓
loadProfile() fetches from database
    ↓
transformToBusinessProfile() converts logo_url → logoUrl
    ↓
populateForm() sets logoUri state to Supabase URL
    ↓
Image component re-renders with new key
    ↓
Image loads from Supabase URL
    ↓
Logo displays ✅
```

## Next Steps After Viewing Logs

Once you run the app and check the logs, we'll be able to identify exactly where the issue is:

1. **If logo_url is NULL**: Fix upload or database save
2. **If URL exists but image doesn't load**: Fix Supabase Storage permissions
3. **If state doesn't update**: Fix React state management
4. **If image fails to render**: Fix Image component or URI format

## Temporary Workaround

If you need the logo to work immediately:
1. Go to Business Settings
2. Upload logo
3. **Don't navigate away** - logo will show from local file
4. Use app with logo visible (but it won't persist after app restart)

We'll fix the persistence issue once we identify the root cause from the logs! 🔍

