import { AccessToken } from 'npm:livekit-server-sdk@2';

type RadioGatewayAssertion = {
  apiKey: string;
  apiSecret: string;
  roomName: string;
  identity: string;
  displayName: string;
  ttl: string;
  metadata: Record<string, unknown>;
};

export async function createRadioGatewayAssertion(input: RadioGatewayAssertion): Promise<string> {
  const token = new AccessToken(input.apiKey, input.apiSecret, {
    identity: input.identity,
    name: input.displayName,
    ttl: input.ttl,
    metadata: JSON.stringify({ ...input.metadata, gatewayAssertionIssuedAt: Date.now() }),
  });
  token.addGrant({ roomJoin: true, room: input.roomName, canPublish: false, canPublishData: false, canSubscribe: true });
  return await token.toJwt();
}

export function radioGatewayUrl(liveKitUrl: string, endpoint: 'session' | 'floor'): string {
  const url = new URL(liveKitUrl);
  url.protocol = url.protocol === 'wss:' || url.protocol === 'https:' ? 'https:' : 'http:';
  url.pathname = `/radio-gateway/${endpoint}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function callRadioGateway(liveKitUrl: string, endpoint: 'session' | 'floor', payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(radioGatewayUrl(liveKitUrl, endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    const error: any = new Error(data?.error || `Radio Gateway request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
