export type AccountStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

export interface Account {
  id: string;
  name: string;
  status: AccountStatus;
  createdAt: string;
  numbers: PhoneNumber[];
}

export interface PhoneNumber {
  id: string;
  accountId: string;
  number: string;
  label: string;
  isDefault: boolean;
}

export type CallDirection = 'inbound' | 'outbound';
export type CallStatus =
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'on-hold'
  | 'ended'
  | 'missed'
  | 'voicemail';

export interface Call {
  id: string;
  accountId: string;
  accountName: string;
  direction: CallDirection;
  status: CallStatus;
  remoteNumber: string;
  remoteName?: string;
  businessNumber: string;
  businessNumberLabel: string;
  startedAt: number;
  connectedAt?: number;
  endedAt?: number;
  muted: boolean;
  onHold: boolean;
  recording: boolean;
}

export interface CallLogEntry {
  id: string;
  accountId: string;
  accountName: string;
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
  businessNumberUsed: string;
  businessNumberLabel: string;
  durationSec: number;
  status: 'completed' | 'missed' | 'voicemail';
  startedAt: string;
}

export interface AppUser {
  email: string;
}

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}
