import { useState, useCallback } from 'react';

type SetValue<T> = T | ((prev: T) => T);

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: SetValue<T>) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: SetValue<T>) => {
    setStoredValue((prev) => {
      const newValue = value instanceof Function ? value(prev) : value;
      window.localStorage.setItem(key, JSON.stringify(newValue));
      return newValue;
    });
  }, [key]);

  return [storedValue, setValue];
}
