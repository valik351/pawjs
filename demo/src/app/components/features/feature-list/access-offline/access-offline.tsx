import Picture from '@pawjs/srcset/picture';
import * as React from 'react';
import OfflineSrcset from './images/offline.png?sizes=400w+800w&placeholder';

console.log('in offline');
export default () => {
  console.log('rendering offline');
  const [counter, setCounter] = React.useState(11);
  return (
    <article>
      <header>
        <h1 className="mt-4" onClick={() => setCounter(counter+1)}>Offline Access - {counter}</h1>
        <hr />
      </header>
      <section>
        {/* <p> */}
        {/* <img src={Offline} className="w-100"/> */}
        {/* </p> */}
        <p>
          When you visit a website without an internet connection in Chrome, you see the
          offline dinosaur.
        </p>
        <p>
          No wonder we tend to think of websites as less reliable than mobile applications -
          we can&quot;t use them without the network.
        </p>
        <p>
          At least, not typically. We could use
          {' '}
          <a
            href="http://diveintohtml5.info/offline.html"
            target="_blank"
            rel="nofollow noopener"
          >
            App Cache
          </a>
          {' '}
          and the Cache Manifest to create an offline experience. For&nbsp;
          <a
            href="http://alistapart.com/article/application-cache-is-a-douchebag"
            target="_blank"
            rel="nofollow noopener"
          >
            a number of reasons
          </a>
          , developers have found App Cache difficult to work with.
        </p>

        <p>
          Luckily, there&quot;s a new web standard,
          {' '}
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API"
            target="_blank"
            rel="nofollow noopener"
          >
            Service Worker
          </a>
          , that potentially supplants App Cache by providing more granular control over
          networking in JavaScript, as opposed to manifest files.
        </p>

        <p>
          Service Workers are JavaScript tasks (a bit like server-side daemons but
          running on the client side)
          that are instantiated by web pages and from that point, can intercept and
          route traffic emanating from that page.
          The Service Worker API is much more flexible than AppCache as it allows
          the developer to decide in minute detail
          what happens to each client-side web request — but with flexibility comes complexity.
        </p>
        <Picture image={OfflineSrcset} imgClassName="w-100" alt="Offline" />
      </section>
    </article>
  );
};

