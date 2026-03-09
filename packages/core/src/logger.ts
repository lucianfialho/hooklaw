import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export function createLogger(name: string) {
  const level = process.env.LOG_LEVEL ?? 'info';

  return pino({
    name,
    level,
    ...(!isProduction && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'HH:MM:ss',
        },
      },
    }),
  });
}
