import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export const dem2 = () => { 
    // Define variables with types
    let scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, stats: Stats;
    let model: THREE.Group, skeleton: THREE.SkeletonHelper, mixer: THREE.AnimationMixer, clock: THREE.Clock;

    const crossFadeControls: GUI[] = [];
    let currentBaseAction: string = 'idle';
    const allActions: THREE.AnimationAction[] = [];
    const baseActions: { [key: string]: { weight: number, action?: THREE.AnimationAction } } = {
        idle: { weight: 0 },
        walk: { weight: 0 },
        run: { weight: 1 }
    };
    const additiveActions: { [key: string]: { weight: number, action?: THREE.AnimationAction } } = {
        sneak_pose: { weight: 0 },
        sad_pose: { weight: 0 },
        agree: { weight: 0 },
        headShake: { weight: 0 }
    };
    let panelSettings: any, numAnimations: number;

    init();

    function init() {
        const container = document.getElementById('app') as HTMLElement;
        clock = new THREE.Clock();

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xa0a0a0);
        scene.fog = new THREE.Fog(0xa0a0a0, 10, 50);

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 3);
        hemiLight.position.set(0, 20, 0);
        scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 3);
        dirLight.position.set(3, 10, 10);
        dirLight.castShadow = true;
        dirLight.shadow.camera.top = 2;
        dirLight.shadow.camera.bottom = -2;
        dirLight.shadow.camera.left = -2;
        dirLight.shadow.camera.right = 2;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 40;
        scene.add(dirLight);

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshPhongMaterial({ color: 0xcbcbcb, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.receiveShadow = true;
        scene.add(mesh);

        const loader = new GLTFLoader();
        loader.load('./src/pages/gltf/Xbot.glb', function (gltf) {
            
            
            model = gltf.scene;
            scene.add(model);

            model.traverse(function (object: any) {
                if (object.isMesh) object.castShadow = true;
            });

            skeleton = new THREE.SkeletonHelper(model);
            skeleton.visible = false;
            scene.add(skeleton);

            const animations = gltf.animations;
            mixer = new THREE.AnimationMixer(model);

            numAnimations = animations.length;

            for (let i = 0; i !== numAnimations; ++i) {
                let clip = animations[i];
                const name = clip.name;

                if (baseActions[name]) {
                    const action = mixer.clipAction(clip);
                    activateAction(action);
                    baseActions[name].action = action;
                    allActions.push(action);
                } else if (additiveActions[name]) {
                    THREE.AnimationUtils.makeClipAdditive(clip);

                    if (clip.name.endsWith('_pose')) {
                        clip = THREE.AnimationUtils.subclip(clip, clip.name, 2, 3, 30);
                    }

                    const action = mixer.clipAction(clip);
                    activateAction(action);
                    additiveActions[name].action = action;
                    allActions.push(action);
                }
            }

            createPanel();
            renderer.setAnimationLoop(animate);
        });

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);

        // 设置镜头
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 100);
        camera.position.set(3, 2, 0);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.enableZoom = false;
        controls.target.set(0, 1, 0);
        controls.update();

        stats = new Stats();
        container.appendChild(stats.dom);

        window.addEventListener('resize', onWindowResize);
    }

    function createPanel() {
        const panel = new GUI({ width: 310 });

        const folder1 = panel.addFolder('Base Actions');
        const folder2 = panel.addFolder('Additive Action Weights');
        const folder3 = panel.addFolder('General Speed');

        panelSettings = {
            'modify time scale': 1.0
        };

        const baseNames = ['None', ...Object.keys(baseActions)];

        for (let i = 0, l = baseNames.length; i !== l; ++i) {
            const name = baseNames[i];
            const settings = baseActions[name];
            panelSettings[name] = function () {
                const currentSettings = baseActions[currentBaseAction];
                const currentAction = currentSettings ? currentSettings.action : null;
                const action = settings ? settings.action : null;

                if (currentAction !== action) {
                    prepareCrossFade(currentAction, action, 0.35);
                }
            };

            crossFadeControls.push(folder1.add(panelSettings, name));
        }

        for (const name of Object.keys(additiveActions)) {
            const settings = additiveActions[name];

            panelSettings[name] = settings.weight;
            folder2.add(panelSettings, name, 0.0, 1.0, 0.01).listen().onChange(function (weight: number) {
                setWeight(settings.action!, weight);
                settings.weight = weight;
            });
        }

        folder3.add(panelSettings, 'modify time scale', 0.0, 1.5, 0.01).onChange(modifyTimeScale);

        folder1.open();
        folder2.open();
        folder3.open();

        crossFadeControls.forEach(function (control) {
            control.setInactive = function () {
                control.domElement.classList.add('control-inactive');
            };

            control.setActive = function () {
                control.domElement.classList.remove('control-inactive');
            };

            const settings = baseActions[control.property];

            if (!settings || !settings.weight) {
                control.setInactive();
            }
        });
    }

    function activateAction(action: THREE.AnimationAction) {
        const clip = action.getClip();
        const settings = baseActions[clip.name] || additiveActions[clip.name];
        setWeight(action, settings.weight);
        action.play();
    }

    function modifyTimeScale(speed: number) {
        mixer.timeScale = speed;
    }

    function prepareCrossFade(startAction: THREE.AnimationAction | null, endAction: THREE.AnimationAction | null, duration: number) {
        if (currentBaseAction === 'idle' || !startAction || !endAction) {
            executeCrossFade(startAction, endAction, duration);
        } else {
            synchronizeCrossFade(startAction, endAction, duration);
        }

        if (endAction) {
            const clip = endAction.getClip();
            currentBaseAction = clip.name;
        } else {
            currentBaseAction = 'None';
        }

        crossFadeControls.forEach(function (control) {
            const name = control.property;

            if (name === currentBaseAction) {
                control.setActive();
            } else {
                control.setInactive();
            }
        });
    }

    function synchronizeCrossFade(startAction: THREE.AnimationAction, endAction: THREE.AnimationAction, duration: number) {
        mixer.addEventListener('loop', onLoopFinished);

        function onLoopFinished(event: any) {
            if (event.action === startAction) {
                mixer.removeEventListener('loop', onLoopFinished);
                executeCrossFade(startAction, endAction, duration);
            }
        }
    }

    function executeCrossFade(startAction: THREE.AnimationAction | null, endAction: THREE.AnimationAction | null, duration: number) {
        if (endAction) {
            setWeight(endAction, 1);
            endAction.time = 0;

            if (startAction) {
                startAction.crossFadeTo(endAction, duration, true);
            } else {
                endAction.fadeIn(duration);
            }
        } else {
            startAction!.fadeOut(duration);
        }
    }

    function setWeight(action: THREE.AnimationAction, weight: number) {
        action.enabled = true;
        action.setEffectiveTimeScale(1);
        action.setEffectiveWeight(weight);
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        for (let i = 0; i !== numAnimations; ++i) {
            const action = allActions[i];
            const clip = action.getClip();
            const settings = baseActions[clip.name] || additiveActions[clip.name];
            settings.weight = action.getEffectiveWeight();
        }

        const mixerUpdateDelta = clock.getDelta();
        mixer.update(mixerUpdateDelta);
        renderer.render(scene, camera);
        stats.update();
    }


}
