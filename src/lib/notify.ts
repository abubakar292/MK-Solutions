import { toast } from 'sonner';

export const notify = {
  success(message: string, description?: string) {
    toast.success(message, {
      description,
      duration: 3200,
    });
  },
  error(message: string, howToFix?: string) {
    toast.error(message, {
      description: howToFix,
      duration: 5000,
    });
  },
  info(message: string, description?: string) {
    toast(message, {
      description,
      duration: 3500,
    });
  },
};
