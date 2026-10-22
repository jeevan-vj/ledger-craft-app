import { organisationService } from '@/services/organisationService';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
}

describe('OrganisationService (Hono)', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3001';
    global.fetch = jest.fn();
  });

  afterEach(() => jest.resetAllMocks());

  it('lists, creates and switches companies through the identity API', async () => {
    const organisation = {
      id: 'f29c47cf-9f79-4d9b-9d4c-aa4b68596216', name: 'South Studio', role: 'owner' as const,
      isActive: true, archivedAt: null,
    };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ organisations: [organisation] }))
      .mockResolvedValueOnce(jsonResponse({ organisation }, 201))
      .mockResolvedValueOnce(jsonResponse({ organisation }));

    await expect(organisationService.list()).resolves.toEqual({ organisations: [organisation] });
    await organisationService.create('South Studio');
    await organisationService.switch(organisation.id);

    expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:3001/api/organisations', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body)).toEqual({ name: 'South Studio' });
    expect(global.fetch).toHaveBeenNthCalledWith(3, `http://127.0.0.1:3001/api/organisations/${organisation.id}/switch`, expect.objectContaining({ method: 'POST' }));
  });

  it('creates a fixed-role invitation and accepts its secure token', async () => {
    const organisationId = 'f29c47cf-9f79-4d9b-9d4c-aa4b68596216';
    const acceptToken = 'a'.repeat(64);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ acceptToken, deliveryStatus: 'link_ready' }, 201))
      .mockResolvedValueOnce(jsonResponse({ accepted: true, organisationId }));

    await organisationService.invite(organisationId, 'bookkeeper@example.com', 'accountant');
    await organisationService.accept(acceptToken);

    const inviteRequest = (global.fetch as jest.Mock).mock.calls[0];
    expect(inviteRequest[0]).toBe(`http://127.0.0.1:3001/api/organisations/${organisationId}/invitations`);
    expect(JSON.parse(inviteRequest[1].body)).toEqual({ email: 'bookkeeper@example.com', role: 'accountant' });
    const acceptRequest = (global.fetch as jest.Mock).mock.calls[1];
    expect(acceptRequest[0]).toBe('http://127.0.0.1:3001/api/invitations/accept');
    expect(JSON.parse(acceptRequest[1].body)).toEqual({ token: acceptToken });
  });
});
