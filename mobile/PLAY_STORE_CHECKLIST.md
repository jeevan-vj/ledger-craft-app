# Google Play Store Publishing Checklist

## Prerequisites

- [ ] Google Play Console account created ($25 one-time registration fee)
- [ ] EAS CLI installed and logged in: `npm install -g eas-cli` then `eas login`
- [ ] Expo account created (free tier available)

## Step 1: Initial Setup

### Install Dependencies
```bash
cd mobile
npm install
```

### Configure EAS Build
```bash
# Login to Expo account
eas login

# Configure EAS Build (if not already done)
eas build:configure
```

## Step 2: Build Configuration

### Verify Configuration Files
- [ ] `eas.json` exists with build profiles (production, preview, development)
- [ ] `app.config.js` has correct Android configuration:
  - [ ] Package name: `com.easybizinvoice.app`
  - [ ] Version code: Starts at 1, auto-increments
  - [ ] Permissions configured (CAMERA, READ_MEDIA_IMAGES, READ_EXTERNAL_STORAGE)
- [ ] Environment variables set:
  - [ ] `EXPO_PUBLIC_SUPABASE_URL`
  - [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Step 3: Build the App

### Production Build (AAB format required for Play Store)
```bash
npm run build:android
# or
eas build --platform android --profile production
```

### Preview Build (APK for testing)
```bash
npm run build:android:preview
# or
eas build --platform android --profile preview
```

**Note:** First build takes 15-20 minutes. Subsequent builds are faster.

## Step 4: Google Play Console Setup

### Create App Listing
1. [ ] Log in to [Google Play Console](https://play.google.com/console)
2. [ ] Click "Create app"
3. [ ] Fill in required information:
   - App name: **EasyBizInvoice**
   - Default language: English (United States)
   - App or game: App
   - Free or paid: Free (or Paid if applicable)
   - Declarations: Complete all required declarations

### Complete Store Listing
- [ ] App name: EasyBizInvoice
- [ ] Short description (80 characters max)
- [ ] Full description (4000 characters max)
- [ ] App icon (512x512 PNG, 32-bit)
- [ ] Feature graphic (1024x500 PNG)
- [ ] Screenshots:
  - [ ] Phone screenshots (min 2, max 8):
    - Minimum resolution: 320px
    - Maximum resolution: 3840px
    - Aspect ratio: 16:9 or 9:16
  - [ ] Tablet screenshots (optional, recommended)
- [ ] Phone promotional graphic (optional, 180x120)

## Step 5: Content Rating

- [ ] Complete content rating questionnaire
- [ ] Address any sensitive permissions explanations:
  - Camera: "Used to capture photos of receipts and invoices"
  - Media library: "Used to select images for logos and receipts"
- [ ] Submit for rating (takes 1-3 days)

## Step 6: Privacy Policy

- [ ] Privacy policy URL required
- [ ] Policy must be:
  - Accessible via public URL
  - Cover data collection and usage
  - Include contact information
- [ ] Add privacy policy URL to Play Console listing

## Step 7: App Content

### Complete All Sections
- [ ] App access
- [ ] Ads
- [ ] Content rating
- [ ] Target audience
- [ ] News apps
- [ ] COVID-19 contact tracing (if applicable)
- [ ] Data safety (required):
  - [ ] Data collection practices
  - [ ] Data security practices
  - [ ] Data sharing practices

## Step 8: Production Release

### Upload AAB
1. [ ] Build production AAB: `npm run build:android`
2. [ ] Download AAB from EAS Build dashboard
3. [ ] Go to Play Console → Production → Create new release
4. [ ] Upload AAB file
5. [ ] Add release notes (what's new in this version)
6. [ ] Review release
7. [ ] Start rollout (to 20% initially, then increase)

### Or Use EAS Submit (Automated)
1. [ ] Set up Google Service Account in Play Console
2. [ ] Download service account JSON key
3. [ ] Save as `google-service-account.json` in mobile folder (add to .gitignore!)
4. [ ] Run: `npm run submit:android`

## Step 9: Testing Tracks (Recommended Before Production)

### Internal Testing
- [ ] Create internal test release
- [ ] Upload AAB/APK
- [ ] Add testers (email addresses)
- [ ] Test app functionality

### Closed Testing (Alpha/Beta)
- [ ] Create closed test track
- [ ] Upload AAB/APK
- [ ] Add testers via email or Google Group
- [ ] Collect feedback

### Open Testing (Beta)
- [ ] Create open test track
- [ ] Upload AAB/APK
- [ ] Users can opt-in via Play Store link
- [ ] Monitor reviews and crashes

## Step 10: Pre-Launch Checklist

### App Quality
- [ ] Test on multiple Android devices (different screen sizes)
- [ ] Test on different Android versions (API 21+)
- [ ] Verify all features work correctly
- [ ] Test image upload/camera functionality
- [ ] Test offline functionality (if applicable)
- [ ] Verify Supabase connection works

### Performance
- [ ] App starts quickly (< 3 seconds)
- [ ] No memory leaks
- [ ] Battery usage reasonable
- [ ] Network requests optimized

### Legal & Compliance
- [ ] Privacy policy published and linked
- [ ] Terms of service (if applicable)
- [ ] All required permissions justified
- [ ] GDPR compliance (if EU users)
- [ ] Data safety section completed accurately

## Step 11: Launch

- [ ] All required sections in Play Console completed (green checkmarks)
- [ ] Content rating approved
- [ ] Production release created and uploaded
- [ ] Release notes added
- [ ] Review app listing one final time
- [ ] Click "Start rollout to Production"
- [ ] Monitor for any review rejections

## Step 12: Post-Launch

### Monitor
- [ ] Check crash reports in Play Console
- [ ] Monitor user reviews
- [ ] Track installs and uninstalls
- [ ] Monitor performance metrics

### Updates
- [ ] Increment version in `app.config.js` (version and versionCode)
- [ ] Build new release: `npm run build:android`
- [ ] Upload to Play Console
- [ ] Add release notes
- [ ] Rollout update (staged rollout recommended)

## Version Management

### Versioning Strategy
- **version**: Semantic version (e.g., "1.0.0", "1.0.1", "1.1.0")
- **versionCode**: Integer that must increment with each release
  - EAS auto-increments for production builds
  - First release: 1
  - Each update: +1

### Update Process
1. Update `version` in `app.config.js` (e.g., "1.0.0" → "1.0.1")
2. `versionCode` auto-increments in production builds
3. Build: `npm run build:android`
4. Upload to Play Console
5. Add release notes
6. Rollout

## Troubleshooting

### Build Fails
- Check `eas.json` configuration
- Verify all dependencies installed
- Check EAS Build logs in dashboard
- Ensure Expo account has build credits

### Upload Rejected
- Review Google Play Console rejection reason
- Address policy violations
- Update app content or permissions
- Resubmit for review

### App Crashes
- Check crash reports in Play Console
- Review Firebase Crashlytics (if integrated)
- Test on physical devices
- Review recent code changes

## Useful Commands

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo
eas login

# Configure EAS Build
eas build:configure

# Build for production
npm run build:android

# Build for preview/testing
npm run build:android:preview

# Submit to Play Store (after service account setup)
npm run submit:android

# Check build status
eas build:list

# View build logs
eas build:view [BUILD_ID]
```

## Additional Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Android App Bundle Guide](https://developer.android.com/guide/app-bundle)
- [Expo EAS Submit](https://docs.expo.dev/submit/introduction/)

