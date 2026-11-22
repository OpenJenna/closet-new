import { Cloud, CloudRain, CloudSun, Snowflake, Sun } from 'lucide-react';
import { WeatherCondition } from '../types/wardrobe';

interface WeatherIconProps {
  condition: WeatherCondition;
  className?: string;
}

export function WeatherIcon({ condition, className = 'w-4 h-4' }: WeatherIconProps) {
  switch (condition) {
    case 'sunny':
      return <Sun className={`${className} text-amber-500`} />;
    case 'partly_cloudy':
      return <CloudSun className={`${className} text-amber-500`} />;
    case 'cloudy':
      return <Cloud className={`${className} text-slate-500`} />;
    case 'rainy':
      return <CloudRain className={`${className} text-blue-500`} />;
    case 'snowy':
      return <Snowflake className={`${className} text-sky-400`} />;
  }
}
