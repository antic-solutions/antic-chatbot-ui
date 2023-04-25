import { useContext } from 'react';

import useStorageService from '@/services/useStorageService';

import { exportData } from '@/utils/app/importExport';

import HomeContext from '@/pages/api/home/home.context';

export const useExporter = () => {
  const storageService = useStorageService();
  const {
    state: { prompts },
  } = useContext(HomeContext);
  return {
    exportData: async () => {
      exportData(storageService, prompts);
    },
  };
};
