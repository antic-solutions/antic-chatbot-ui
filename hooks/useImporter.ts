import useStorageService from '@/services/useStorageService';

import { cleanData } from '@/utils/app/importExport';
import { trpc } from '@/utils/trpc';

import { SupportedExportFormats } from '@/types/export';
import { Settings } from '@/types/settings';

export const useImporter = () => {
  const storageService = useStorageService();
  const promptsMutation = trpc.prompts.updateAll.useMutation();

  return {
    importData: async (settings: Settings, data: SupportedExportFormats) => {
      console.log('import');
      const cleanedData = cleanData(data, {
        temperature: settings.defaultTemperature,
      });
      const { history, folders, prompts } = cleanedData;

      const conversations = history;
      await storageService.saveConversations(conversations);
      await storageService.saveFolders(folders);
      await promptsMutation.mutateAsync(prompts);
      localStorage.setItem(
        'selectedConversation',
        JSON.stringify(conversations[conversations.length - 1]),
      );
      return cleanedData;
    },
  };
};
