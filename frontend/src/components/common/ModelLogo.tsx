/**
 * ModelLogo 组件
 *
 * 根据模型名称显示对应的 Logo 图标
 * 统一的模型 Logo 映射组件，消除多个文件中的重复定义
 */

import { FC, memo } from 'react';

/**
 * 模型名称到 Logo 文件名的映射
 */
const MODEL_LOGO_MAP: Record<string, string> = {
  deepseek: 'deepseek',
  kimi: 'kimi',
  qwen: 'qwen',
  glm: 'zai', // GLM 模型对应 zai.svg
  ollama: 'ollama',
  minimax: 'minimax',
  orcarouter: 'orcarouter.png', // 官方仅提供 PNG 版本
};

/**
 * 获取模型 Logo 路径
 * @param modelName - 模型名称
 * @returns Logo 文件路径
 */
const getLogoPath = (modelName: string): string => {
  let normalizedModel = modelName.toLowerCase();
  // 处理 ollama/model-name 格式，统一映射到 ollama logo
  if (normalizedModel.startsWith('ollama/')) {
    normalizedModel = 'ollama';
  }
  const logoName = MODEL_LOGO_MAP[normalizedModel] || 'deepseek'; // 默认使用 deepseek logo
  // 映射值显式带扩展名（如 orcarouter.png）时直接使用，否则默认 .svg。
  // 用 endsWith 而非 includes，避免模型名/文件名含点时误判
  const ext =
    logoName.endsWith('.svg') || logoName.endsWith('.png') ? '' : '.svg';
  return `/assets/llm-logo/${logoName}${ext}`;
};

interface ModelLogoProps {
  /** 模型名称 */
  model: string;
  /** Logo 尺寸（宽高相等） */
  size?: number;
  /** 额外的 CSS 类名 */
  className?: string;
}

/**
 * 模型 Logo 组件
 *
 * @example
 * <ModelLogo model="deepseek" size={16} />
 * <ModelLogo model="glm" size={32} className="dialogue-model-logo" />
 */
const ModelLogo: FC<ModelLogoProps> = memo(
  ({ model, size = 16, className }) => {
    return (
      <img
        src={getLogoPath(model)}
        alt={model}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
        }}
        className={className}
      />
    );
  },
);

ModelLogo.displayName = 'ModelLogo';

export default ModelLogo;
