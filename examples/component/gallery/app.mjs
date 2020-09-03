import GalleryMainContainer  from './GalleryMainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/gallery/',
    mainView: GalleryMainContainer,
    name    : 'TestApp'
});

export {onStart as onStart};