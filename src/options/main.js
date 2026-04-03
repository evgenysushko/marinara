import Vue from 'vue';
import App from './App';
import router from './router';
import M from '../Messages';

Vue.config.productionTip = false;
Vue.config.devtools = false;

Vue.mixin({
  computed: {
    M() {
      return M;
    }
  }
});

// Register this tab so SingletonPage can find it even when
// opened by Chrome's native Options handler.
chrome.tabs.getCurrent().then(tab => {
  if (tab) {
    let key = `singleton:${location.pathname.replace(/\/$/, '').toLowerCase()}`;
    chrome.storage.session.set({ [key]: tab.id });
  }
});

new Vue({
  router,
  render: h => h(App)
}).$mount('#app');