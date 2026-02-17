import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API_ENDPOINTS, buildApiUrl } from '../../config/api';

interface AvailableModel {
  value: string;
  label: string;
}

interface UseModelSelectionReturn {
  selectedModel: string;
  availableModels: AvailableModel[];
  handleModelChange: (model: string) => void;
}

export const useModelSelection = (): UseModelSelectionReturn => {
  const [selectedModel, setSelectedModel] = useState('deepseek'); // 默认使用第一个可用模型
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);

  // 获取可用模型列表
  const fetchAvailableModels = useCallback(async (): Promise<void> => {
    try {
      const response = await axios.get(buildApiUrl(API_ENDPOINTS.GET_MODELS));
      if (response.data.models) {
        const models = response.data.models.map(
          (model: { name: string; display_name: string }) => ({
            value: model.name,
            label: model.display_name,
          }),
        );
        setAvailableModels(models);

        // 如果当前选择的模型不在列表中，选择第一个可用模型
        if (!models.some((m: AvailableModel) => m.value === selectedModel)) {
          setSelectedModel(models[0]?.value || 'deepseek');
        }
      }
    } catch (error) {
      console.error('获取模型列表失败:', error);
      // 使用默认模型列表作为降级方案
      const defaultModels = [
        { value: 'deepseek', label: 'DeepSeek' },
        { value: 'qwen', label: 'Qwen' },
        { value: 'kimi', label: 'Kimi' },
        { value: 'glm', label: 'GLM' },
      ];
      setAvailableModels(defaultModels);
    }
  }, [selectedModel]);

  // 组件加载时获取模型列表
  useEffect(() => {
    fetchAvailableModels();
  }, [fetchAvailableModels]);

  // 处理模型选择，只接受字符串类型
  const handleModelChange = (model: string): void => {
    setSelectedModel(model);
    console.log('选择模型:', model);
  };

  return {
    selectedModel,
    availableModels,
    handleModelChange,
  };
};
