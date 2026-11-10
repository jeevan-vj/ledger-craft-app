import { useQuery } from '@tanstack/react-query';
import { getServerCapabilities } from '@/services/capabilitiesService';

export function useAssistantCapability() {
  return useQuery({
    queryKey: ['server-capabilities'],
    queryFn: getServerCapabilities,
    staleTime: 60_000,
  });
}
