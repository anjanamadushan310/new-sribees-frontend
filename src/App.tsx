import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp } from 'antd';
import AppRouter from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#D81B60',
            borderRadius: 10,
          },
        }}
      >
        <AntApp>
          <AppRouter />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
};

export default App;
