import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Entry point for invite links: voicealarm://join/ABC123.
 *
 * It only forwards to the join screen with the code prefilled — the actual joining lives in one
 * place so a link and a typed code cannot drift apart.
 */
export default function JoinLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: '/room/join', params: { code: (code ?? '').toUpperCase() } }} />;
}
