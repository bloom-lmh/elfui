// 表单关联 Custom Element (form-associated custom elements)
//
// 设计：
// - 组件 builder.formControl() 设置 static formAssociated = true
// - element.ts 在 connectedCallback 创建 ElementInternals 实例
// - 注入 ctx.form：setValue / validate / report / reset / valid
//
// 校验语义（最小可用集）：
// - rules(rules)：注册校验规则数组
// - validate()：跑所有规则，返回 { valid, message? }
// - report()：触发原生 reportValidity（弹错气泡）
// - setValue(v)：通过 internals.setFormValue 同步到 form
// - reset()：恢复默认值

import { warn } from "./config";
import { DEV as __DEV__ } from "./dev";
import { getCurrentInstance } from "./lifecycle";

export type FormControlValue = string | File | FormData | null;

export interface FormControlRule<T = unknown> {
  /** 校验函数：返回 true / 错误消息 / Promise<true | string> */
  validator: (value: T) => boolean | string | Promise<boolean | string>;
  /** 错误消息 */
  message?: string;
}

export interface FormControlValidationResult<T = unknown> {
  valid: boolean;
  value: T;
  message?: string;
  rule?: FormControlRule<T>;
}

export interface FormControlContext<T = unknown> {
  /** 注册校验规则 */
  rules: (rules: FormControlRule<T>[]) => void;
  /** 跑校验，返回结果 */
  validate: () => Promise<FormControlValidationResult<T>>;
  /** 触发原生弹错气泡 */
  report: () => boolean;
  /** 重置为默认值 */
  reset: () => void;
  /** 设置当前值并同步到 form */
  setValue: (value: T) => void;
  /** 直接读取当前值 */
  getValue: () => T;
  /** 是否当前有效（最近一次 validate 的结果） */
  readonly valid: boolean;
}

export interface FormControlOptions<T = unknown> {
  /** 默认值（reset 用） */
  defaultValue?: T;
  /** 初始规则 */
  rules?: FormControlRule<T>[];
}

const failNoFormControlContext = (reason: string): never => {
  throw new Error(
    __DEV__ ? `[useFormControlContext] ${reason}` : "[useFormControlContext] no form context"
  );
};

/** 读取当前组件的 formControl 上下文，适合宏组件顶层或 setup 内调用。 */
export const useFormControlContext = <T = unknown>(): FormControlContext<T> => {
  const instance = getCurrentInstance();
  if (!instance) {
    return failNoFormControlContext("必须在 setup 同步执行期间调用。");
  }

  const form = instance.form as FormControlContext<T> | undefined;
  if (!form) {
    return failNoFormControlContext(
      "当前组件没有启用 formControl，请设置 formControl: true 或 defineOptions({ formControl: true })。"
    );
  }

  return form;
};

/** 创建 FormControlContext。host 必须实现 attachInternals（即 formAssociated=true） */
export const createFormControlContext = <T = unknown>(
  host: HTMLElement,
  options: FormControlOptions<T> = {}
): FormControlContext<T> => {
  const internals = (
    host as HTMLElement & { attachInternals?: () => ElementInternals }
  ).attachInternals?.();
  if (!internals) {
    if (__DEV__) warn("[formControl] 当前元素不支持 ElementInternals，formControl 功能受限。");
  }

  let currentValue: T = options.defaultValue as T;
  let currentRules: FormControlRule<T>[] = options.rules ?? [];
  let lastValid = true;

  const setValue = (value: T): void => {
    currentValue = value;
    if (internals) {
      try {
        internals.setFormValue(value as FormControlValue);
      } catch {
        // jsdom 等环境可能没实现 setFormValue
      }
    }
  };

  const reset = (): void => {
    setValue(options.defaultValue as T);
    if (internals) {
      try {
        internals.setValidity({});
      } catch {
        // jsdom fallback
      }
    }
    lastValid = true;
  };

  const rules = (next: FormControlRule<T>[]): void => {
    currentRules = next;
  };

  const validate = async (): Promise<FormControlValidationResult<T>> => {
    for (const rule of currentRules) {
      try {
        const r = await rule.validator(currentValue);
        if (r === true) continue;
        const message = typeof r === "string" ? r : (rule.message ?? "validation failed");
        if (internals) {
          try {
            internals.setValidity({ customError: true }, message);
          } catch {
            // 环境不支持时忽略
          }
        }
        lastValid = false;
        return { valid: false, value: currentValue, message, rule };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (internals) {
          try {
            internals.setValidity({ customError: true }, message);
          } catch {
            // 环境不支持时忽略
          }
        }
        lastValid = false;
        return { valid: false, value: currentValue, message, rule };
      }
    }
    if (internals) {
      try {
        internals.setValidity({});
      } catch {
        // 环境不支持时忽略
      }
    }
    lastValid = true;
    return { valid: true, value: currentValue };
  };

  const report = (): boolean => {
    if (!internals) return true;
    try {
      return internals.reportValidity();
    } catch {
      return true;
    }
  };

  return {
    rules,
    validate,
    report,
    reset,
    setValue,
    getValue: () => currentValue,
    get valid(): boolean {
      return lastValid;
    }
  };
};
