import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { FormField } from '../components/FormField';
import { HabitNameInput } from '../components/HabitNameInput';
import { TotalDaysInput } from '../components/TotalDaysInput';
import { ReminderTypeSelector } from '../components/ReminderTypeSelector';
import { ReminderTimeInput } from '../components/ReminderTimeInput';
import { ColorSwatchPicker } from '../components/ColorSwatchPicker';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { isValidTimeString, type NewHabitInput } from '../types/habit';

interface CreateHabitFormProps {
  onExit: () => void;
  onSave: (data: NewHabitInput) => void;
}

type FormErrors = {
  name?: string;
  totalDays?: string;
  reminderType?: string;
  reminderTime?: string;
  color?: string;
  difficulty?: string;
};

export function CreateHabitForm({ onExit, onSave }: CreateHabitFormProps) {
  const [formData, setFormData] = useState<NewHabitInput>({
    name: '',
    totalDays: 30,
    reminderType: '抽象搞笑',
    reminderTime: '08:00',
    color: 'rose',
    difficulty: 3,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorList, setErrorList] = useState<string[]>([]);

  const validate = (): FormErrors => {
    const newErrors: FormErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = '请输入习惯名';
    } else if (formData.name.trim().length > 30) {
      newErrors.name = '习惯名不超过 30 字符';
    }
    if (formData.totalDays < 14 || formData.totalDays > 365) {
      newErrors.totalDays = '请输入 14~365 之间的天数';
    }
    if (!formData.reminderType) {
      newErrors.reminderType = '请选择提醒方式';
    }
    if (!formData.reminderTime) {
      newErrors.reminderTime = '请选择提醒时间';
    } else if (!isValidTimeString(formData.reminderTime)) {
      newErrors.reminderTime = '请输入有效的时间（HH:MM）';
    }
    if (!formData.color) {
      newErrors.color = '请选择颜色';
    }
    if (formData.difficulty < 1 || formData.difficulty > 5) {
      newErrors.difficulty = '难度必须在 1~5 之间';
    }
    return newErrors;
  };

  const handleSave = () => {
    const newErrors = validate();
    setErrors(newErrors);

    const msgs = Object.values(newErrors).filter(
      (v): v is string => !!v
    );
    if (msgs.length > 0) {
      setErrorList(msgs);
      setShowErrorModal(true);
      return;
    }
    onSave(formData);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="app-shell">
        <header className="form-top-bar">
          <button
            onClick={onExit}
            className="form-top-bar__btn form-top-bar__btn--exit"
            aria-label="退出创建"
            type="button"
          >
            取消
          </button>
          <h1 className="form-top-bar__title">新建习惯</h1>
          <button
            onClick={handleSave}
            className="btn-gradient h-9 px-5 text-[13px] font-bold"
            aria-label="保存习惯"
            type="button"
          >
            保存
          </button>
        </header>

        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="form-body"
        >
          <FormField
            label="想要养成的习惯"
            error={errors.name}
            hint={!errors.name ? '给自己起一个清晰、好记的名字' : undefined}
          >
            <HabitNameInput
              value={formData.name}
              onChange={(v) => setFormData({ ...formData, name: v })}
              error={errors.name}
            />
          </FormField>

          <FormField
            label="习惯养成天数"
            error={errors.totalDays}
            hint={!errors.totalDays ? '范围：14 ~ 365 天' : undefined}
          >
            <TotalDaysInput
              value={formData.totalDays}
              onChange={(v) => setFormData({ ...formData, totalDays: v })}
              error={errors.totalDays}
            />
          </FormField>

          <FormField
            label="习惯提醒方式"
            error={errors.reminderType}
            hint={!errors.reminderType ? '共 5 种风格，左右滑动可选' : undefined}
          >
            <ReminderTypeSelector
              value={formData.reminderType}
              onChange={(v) => setFormData({ ...formData, reminderType: v })}
            />
          </FormField>

          <FormField
            label="习惯提醒时间"
            error={errors.reminderTime}
            hint={!errors.reminderTime ? '每天同一时间触发提醒' : undefined}
          >
            <ReminderTimeInput
              value={formData.reminderTime}
              onChange={(v) => setFormData({ ...formData, reminderTime: v })}
              error={errors.reminderTime}
            />
          </FormField>

          <FormField
            label="图标颜色"
            error={errors.color}
            hint={!errors.color ? '用于 Tab 1 卡片底色（18 色可选）' : undefined}
          >
            <ColorSwatchPicker
              value={formData.color}
              onChange={(v) => setFormData({ ...formData, color: v })}
            />
          </FormField>

          <FormField
            label="习惯难度"
            error={errors.difficulty}
            hint={!errors.difficulty ? '用于参与努力值计算' : undefined}
          >
            <DifficultyPicker
              value={formData.difficulty}
              onChange={(v) => setFormData({ ...formData, difficulty: v })}
              error={errors.difficulty}
            />
          </FormField>
        </motion.main>
      </div>

      {/* 校验失败弹窗（梦幻风格：圆角卡片 + 紫色图标 + 渐变按钮） */}
      <AnimatePresence>
        {showErrorModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{
              background: 'rgba(74, 68, 88, 0.45)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
            onClick={() => setShowErrorModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{
                duration: 0.25,
                ease: [0.34, 1.56, 0.64, 1],
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-[22px] p-6 max-w-[340px] w-full"
              style={{
                boxShadow:
                  '0 16px 48px rgba(161, 140, 209, 0.32)',
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background:
                      'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
                    boxShadow:
                      '0 4px 12px rgba(161, 140, 209, 0.4)',
                  }}
                >
                  <AlertCircle
                    className="w-5 h-5 text-white"
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                </div>
                <h3 className="text-[17px] font-bold text-foreground">
                  请检查以下字段
                </h3>
              </div>
              <ul className="space-y-2 mb-5 pl-1">
                {errorList.map((msg, i) => (
                  <li
                    key={i}
                    className="text-[14px] text-foreground flex items-start gap-2"
                  >
                    <span
                      className="shrink-0 leading-[20px]"
                      style={{ color: '#a18cd1' }}
                    >
                      •
                    </span>
                    <span className="leading-[20px]">{msg}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setShowErrorModal(false)}
                className="btn-gradient w-full h-11 text-[14px] font-bold"
                type="button"
              >
                我知道了
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}