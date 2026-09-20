import { Linking } from 'react-native';
import {
  CONTACT_PUBLIC_URL,
  LEGAL_EMAIL,
  PRIVACY_PUBLIC_URL,
  TERMS_PUBLIC_URL,
} from '../constants/legalTerms';
import { legalDocumentViewed } from './analytics/events/engagement';

export function openLegalDocument(
  document: 'terms' | 'privacy',
  source_screen: 'sign_in' | 'match' | 'profile',
): void {
  legalDocumentViewed({ document, source_screen });
  void Linking.openURL(document === 'terms' ? TERMS_PUBLIC_URL : PRIVACY_PUBLIC_URL);
}

export function openContactPage(): void {
  void Linking.openURL(CONTACT_PUBLIC_URL);
}

export function openSupportEmail(): void {
  void Linking.openURL(`mailto:${LEGAL_EMAIL}?subject=Remedy%20support`);
}
