import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-erz-import',
    version: '1.0.0',
    title: 'ERZ routing import',
    icon: '⛵',
    description:
        'Imports an ERZ sailing weather-routing file and moves the boat along the route in sync with the forecast timeline.',
    author: 'Rastislav Pecena',
    repository: 'https://github.com/FF-ko/windy-plugin-erz-import',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/erz-import',
    private: true,
};

export default config;
