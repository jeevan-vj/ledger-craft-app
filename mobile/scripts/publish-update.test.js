const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { publishUpdate } = require('./publish-update');

describe('EAS update publishing', () => {
  let cwd;
  let run;
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-update-'));
    run = jest.fn(() => ({ status: 0 }));
  });
  afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const options = () => ({ cwd, run, env: { SENTRY_AUTH_TOKEN: 'test-token' } });
  const exportMaps = () => run.mockImplementationOnce(() => {
    fs.mkdirSync(path.join(cwd, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'dist', 'ios.hbc.map'), '{}');
    fs.writeFileSync(path.join(cwd, 'dist', 'android.hbc.map'), '{}');
    fs.writeFileSync(path.join(cwd, 'dist', 'metadata.json'), JSON.stringify({ fileMetadata: {
      ios: { bundle: 'ios.hbc' }, android: { bundle: 'android.hbc' },
    } }));
    return { status: 0 };
  });

  test('production without upload credentials stops before exporting or publishing', () => {
    expect(() => publishUpdate('production', [], { ...options(), env: {} })).toThrow(/SENTRY_AUTH_TOKEN/);
    expect(run).not.toHaveBeenCalled();
  });
  test('exports under the selected EAS environment and uploads before publishing with pinned CLI', () => {
    exportMaps();
    publishUpdate('production', ['--message', 'OTA check'], options());
    expect(run.mock.calls[0][1]).toEqual(['--yes', 'eas-cli@25.3.0', 'env:exec', 'production', 'npx expo export --platform ios --platform android --source-maps --output-dir dist', '--non-interactive']);
    expect(run.mock.calls[1][1][0]).toMatch(/expo-upload-sourcemaps\.js$/);
    expect(run.mock.calls[1][1][1]).toBe('dist');
    expect(run.mock.calls[2][1]).toEqual(['--yes', 'eas-cli@25.3.0', 'update', '--channel', 'production', '--environment', 'production', '--platform', 'all', '--skip-bundler', '--input-dir', 'dist', '--message', 'OTA check']);
  });
  test('iOS-only publication exports and publishes the same platform', () => {
    exportMaps();
    publishUpdate('production', ['--platform', 'ios', '--message', 'iOS check'], options());
    expect(run.mock.calls[0][1][4]).toContain('export --platform ios');
    expect(run.mock.calls[2][1]).toContain('ios');
    expect(run.mock.calls[2][1]).not.toContain('all');
  });
  test('failed export stops before upload and publication', () => {
    run.mockReturnValueOnce({ status: 7 });
    expect(() => publishUpdate('production', [], options())).toThrow(/export.*7/);
    expect(run).toHaveBeenCalledTimes(1);
  });
  test('missing maps stops before publication instead of accepting uploader zero-map success', () => {
    expect(() => publishUpdate('production', [], options())).toThrow(/source maps/);
    expect(run).toHaveBeenCalledTimes(1);
  });
  test('missing maps for either native platform prevents publication', () => {
    exportMaps();
    // Remove one map just after the simulated export.
    const first = run;
    const wrapped = (...args) => {
      const result = first(...args);
      fs.rmSync(path.join(cwd, 'dist', 'android.hbc.map'), { force: true });
      return result;
    };
    expect(() => publishUpdate('production', [], { ...options(), run: wrapped })).toThrow(/source maps/);
    expect(run).toHaveBeenCalledTimes(1);
  });
  test('upload failure prevents publication', () => {
    exportMaps();
    run.mockReturnValueOnce({ status: 1 });
    expect(() => publishUpdate('production', [], options())).toThrow(/Sentry.*1/);
    expect(run).toHaveBeenCalledTimes(2);
  });
  test('publication failure propagates', () => {
    exportMaps();
    run.mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: 2 });
    expect(() => publishUpdate('production', [], options())).toThrow(/EAS Update.*2/);
  });
  test('preview remains usable without Sentry credentials', () => {
    publishUpdate('preview', [], { ...options(), env: {} });
    expect(run).toHaveBeenCalledTimes(1);
  });
  test('channel and output overrides cannot bypass the production safeguards', () => {
    for (const arg of ['--channel', '--environment=preview', '--output-dir', '--skip-bundler', '--input-dir=old', '--branch', '--auto']) {
      expect(() => publishUpdate('production', [arg], options())).toThrow(/Unsupported/);
    }
    expect(run).not.toHaveBeenCalled();
  });
});
