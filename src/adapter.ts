/** @noSelfInFile **/

import {
	Adapter,
	flushUpdates,
	render,
} from "../node_modules/basic-pragma/src/index";

// https://wc3modding.info/pages/jass-documentation-database/class/functions/file/common.j/
// https://discordapp.com/channels/178569180625240064/311662737015046144/764384452867784704

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

const frameDefaults = {
	// immutable props
	name: "AnonymousFrame",
	priority: 0,
	isSimple: true,
	typeName: null,
	inherits: "",
	context: 0,
	key: null,
	// mutable props
	alpha: 255,
	enabled: true,
	font: { fileName: "", height: 16, flags: 0 },
	level: 0,
	maxLength: 9999,
	minMaxValue: { min: -999999999, max: 999999999 },
	model: { modelFile: "", cameraIndex: 0 },
	scale: 1,
	spriteAnimate: { primaryProp: 0, flags: 0 },
	stepSize: 0,
	text: "",
	textAlignment: { vert: TEXT_JUSTIFY_TOP, horz: TEXT_JUSTIFY_LEFT },
	textColor: 0xffffff,
	texture: { texFile: "", flag: 0, blend: true },
	tooltip: null,
	value: 0,
	vertexColor: 0xffffff,
	visible: true,
	position: null,
	absPosition: null,
	size: { width: 0, height: 0 },
	children: null,
	ref: null,
	parentFrame: null,
	onLoad: noop,
	// events
	onClick: null,
	onMouseEnter: null,
	onMouseLeave: null,
	onMouseUp: null,
	onMouseDown: null,
	onMouseWheel: null,
	onCheckboxChecked: null,
	onCheckboxUnchecked: null,
	onEditboxTextChanged: null,
	onPopupmenuItemChanged: null,
	onDoubleClick: null,
	onSpriteAnimUpdate: null,
	onSliderChanged: null,
	onDialogCancel: null,
	onDialogAccept: null,
	onEditboxEnter: null,
} as const;

// Just a type assertion; we want const above to handle polymorphic types
frameDefaults as Required<FrameProps> & { children: null };

const absurd = (value: never) => {
	throw `Got ${value} when expected nothing`;
};

const triggerMap = new WeakMap<() => void, trigger>();

const setEventProp = (
	frame: framehandle,
	// This typing is wrong, should be prop: K, value?: FrameProps[K]
	event: frameeventtype,
	val?: () => void,
	oldValue?: () => void,
) => {
	// Get the existing trigger
	let t = triggerMap.get(oldValue!);

	// Destroy it if there's no mouse event
	if (val == null) {
		if (t) {
			DestroyTrigger(t);
			triggerMap.delete(oldValue!);
		}

		return;
	}

	// Create the trigger if it doesn't exist
	if (t == null) {
		t = CreateTrigger();
		BlzTriggerRegisterFrameEvent(t, frame, event);
	}

	// Otherwise clear old conditions
	else TriggerClearConditions(t);

	TriggerAddCondition(
		t,
		Condition(() => {
			// Clear focus
			if (event === FRAMEEVENT_CONTROL_CLICK) {
				BlzFrameSetEnable(frame, false);
				BlzFrameSetEnable(frame, true);
			}
			val();
			return false;
		}),
	);
	triggerMap.set(val, t);
};

const firstChildRelativePoints = [
	FRAMEPOINT_TOPLEFT,
	FRAMEPOINT_TOP,
	FRAMEPOINT_LEFT,
];

const lastChildRelativePoints = [
	FRAMEPOINT_RIGHT,
	FRAMEPOINT_BOTTOM,
	FRAMEPOINT_BOTTOMRIGHT,
];

const resolveRelative = (
	frame: framehandle,
	relative: RelativeFrame,
	relativePoint: framepointtype,
) => {
	if (typeof relative !== "string") return relative;

	switch (relative) {
		case "parent":
			return BlzFrameGetParent(frame);
		case "previous": {
			const parent = BlzFrameGetParent(frame);
			const children = BlzFrameGetChildrenCount(parent);
			let index = -1;
			for (let i = 0; i < children; i++)
				if (BlzFrameGetChild(parent, i) === frame) {
					index = i;
					break;
				}
			if (index > 0) return BlzFrameGetChild(parent, index - 1);
			return null;
		}
		case "children":
			if (firstChildRelativePoints.includes(relativePoint))
				return BlzFrameGetChild(frame, 0);
			if (lastChildRelativePoints.includes(relativePoint))
				return BlzFrameGetChild(
					frame,
					BlzFrameGetChildrenCount(frame) - 1,
				);
			throw `When using relative=children, expected relativePoint to be in ${firstChildRelativePoints} or ${lastChildRelativePoints}`;
		case "children-reverse":
			if (lastChildRelativePoints.includes(relativePoint))
				return BlzFrameGetChild(frame, 0);
			if (firstChildRelativePoints.includes(relativePoint))
				return BlzFrameGetChild(
					frame,
					BlzFrameGetChildrenCount(frame) - 1,
				);
			throw `When using relative=children, expected relativePoint to be in ${firstChildRelativePoints} or ${lastChildRelativePoints}`;
		default:
			absurd(relative);
	}
};

const previousToParentPoint = (relative: framepointtype) => {
	switch (relative) {
		// Span
		case FRAMEPOINT_RIGHT:
			return FRAMEPOINT_LEFT;
		// Div
		case FRAMEPOINT_BOTTOM:
			return FRAMEPOINT_TOP;

		case FRAMEPOINT_BOTTOMLEFT:
			return FRAMEPOINT_TOPLEFT;
		case FRAMEPOINT_BOTTOMRIGHT:
			return FRAMEPOINT_TOPRIGHT;
	}
};

const tooltipMap = new WeakMap<framehandle, framehandle>();

let scale = 1600 * 1.25;
/**
 * Sets the UI scale for pixel measurements. Defaults to 1600.
 */
export const setPixelScale = (newScale: number): void => {
	scale = newScale * 1.25;
};

/**
 * Allows usage of Blizzard sizes (where 0.8 fills the 5:4 box width, 0.6 the
 * 5:4 box height) and pixels (where 1600 is the full width and 1200 is the
 * full height)
 */
const smartSize = (size: number) =>
	size < 1 && size > -1 ? size : size / scale;

const setProp = (
	frame: framehandle,
	// This typing is wrong, should be prop: K, value?: FrameProps[K]
	prop: keyof FrameProps | "children",
	value?: FrameProps[keyof FrameProps],
	oldValue?: FrameProps[keyof FrameProps],
) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const val = value ?? (frameDefaults[prop] as any);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const _oldValue = oldValue as any;
	switch (prop) {
		case "text": {
			BlzFrameSetText(frame, val);
			break;
		}
		case "maxLength": {
			BlzFrameSetTextSizeLimit(frame, val);
			break;
		}
		case "textColor": {
			BlzFrameSetTextColor(frame, val);
			break;
		}
		case "texture": {
			const val2 = typeof val === "string" ? { texFile: val } : val;
			BlzFrameSetTexture(
				frame,
				val2.texFile ?? frameDefaults.texture.texFile,
				val2.flag ?? frameDefaults.texture.flag,
				val2.blend ?? frameDefaults.texture.blend,
			);
			break;
		}
		case "model": {
			BlzFrameSetModel(
				frame,
				val.modelFile ?? frameDefaults.model.modelFile,
				val.cameraIndex ?? frameDefaults.model.cameraIndex,
			);
			break;
		}
		case "alpha": {
			BlzFrameSetAlpha(frame, val);
			break;
		}
		case "level": {
			BlzFrameSetLevel(frame, val);
			break;
		}
		case "visible": {
			BlzFrameSetVisible(frame, val);
			break;
		}
		case "enabled": {
			BlzFrameSetEnable(frame, val);
			break;
		}
		case "vertexColor": {
			BlzFrameSetVertexColor(frame, val);
			break;
		}
		case "value": {
			BlzFrameSetValue(frame, val);
			break;
		}
		case "size": {
			BlzFrameSetSize(
				frame,
				smartSize(val.width ?? frameDefaults.size.width),
				smartSize(val.height ?? frameDefaults.size.height),
			);
			break;
		}
		case "stepSize": {
			BlzFrameSetStepSize(frame, val);
			break;
		}
		case "tooltip": {
			const existingTooltip = tooltipMap.get(frame);
			let tooltip;
			if (existingTooltip) tooltip = existingTooltip;
			else {
				tooltip = adapter.createFrame(
					"container",
					BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0),
					{ name: "Tooltip" },
				);
				tooltipMap.set(frame, tooltip);
				BlzFrameSetTooltip(frame, tooltip);
			}
			render(val, tooltip);
			break;
		}
		case "font": {
			BlzFrameSetFont(
				frame,
				val.fileName ?? frameDefaults.font.fileName,
				val.height ?? frameDefaults.font.height,
				val.flags ?? frameDefaults.font.flags,
			);
			break;
		}
		case "minMaxValue": {
			BlzFrameSetMinMaxValue(
				frame,
				val.min ?? frameDefaults.minMaxValue.min,
				val.max ?? frameDefaults.minMaxValue.max,
			);
			break;
		}
		case "scale": {
			BlzFrameSetScale(frame, val);
			break;
		}
		case "spriteAnimate": {
			BlzFrameSetSpriteAnimate(
				frame,
				val.primaryProp ?? frameDefaults.spriteAnimate.primaryProp,
				val.flags ?? frameDefaults.spriteAnimate.flags,
			);
			break;
		}
		case "textAlignment": {
			BlzFrameSetTextAlignment(
				frame,
				val.vert ?? frameDefaults.textAlignment.vert,
				val.horz ?? frameDefaults.textAlignment.horz,
			);
			break;
		}
		case "position": {
			if (val != null) {
				const positions: Pos[] =
					val === "parent" || val === "clear" || "point" in val
						? [val as Pos]
						: (val as Pos[]);

				for (const position of positions)
					if (position === "clear") BlzFrameClearAllPoints(frame);
					else if (position === "parent")
						BlzFrameSetAllPoints(frame, BlzFrameGetParent(frame));
					else {
						const relative = resolveRelative(
							frame,
							position.relative,
							position.relativePoint,
						);
						if (relative)
							BlzFrameSetPoint(
								frame,
								position.point,
								relative,
								position.relativePoint,
								smartSize(position.x ?? 0),
								smartSize(position.y ?? 0),
							);
						// We used `previous` and we're the first child
						else {
							const parentRelative = previousToParentPoint(
								position.relativePoint,
							);
							if (parentRelative)
								BlzFrameSetPoint(
									frame,
									position.point,
									BlzFrameGetParent(frame),
									parentRelative,
									smartSize(position.x ?? 0),
									smartSize(position.y ?? 0),
								);
						}
					}
			}
			break;
		}
		case "absPosition": {
			if (val != null) {
				const positions: AbsPos[] =
					val === "clear" || "point" in val
						? [val as AbsPos]
						: (val as AbsPos[]);

				for (const absPosition of positions)
					if (absPosition === "clear") BlzFrameClearAllPoints(frame);
					else
						BlzFrameSetAbsPoint(
							frame,
							absPosition.point,
							smartSize(absPosition.x ?? 0),
							smartSize(absPosition.y ?? 0),
						);
			}
			break;
		}
		case "onClick": {
			setEventProp(frame, FRAMEEVENT_CONTROL_CLICK, val, _oldValue);
			break;
		}
		case "onMouseEnter": {
			setEventProp(frame, FRAMEEVENT_MOUSE_ENTER, val, _oldValue);
			break;
		}
		case "onMouseLeave": {
			setEventProp(frame, FRAMEEVENT_MOUSE_LEAVE, val, _oldValue);
			break;
		}
		case "onMouseUp": {
			setEventProp(frame, FRAMEEVENT_MOUSE_UP, val, _oldValue);
			break;
		}
		case "onMouseDown": {
			setEventProp(frame, FRAMEEVENT_MOUSE_DOWN, val, _oldValue);
			break;
		}
		case "onMouseWheel": {
			setEventProp(frame, FRAMEEVENT_MOUSE_WHEEL, val, _oldValue);
			break;
		}
		case "onCheckboxChecked": {
			setEventProp(frame, FRAMEEVENT_CHECKBOX_CHECKED, val, _oldValue);
			break;
		}
		case "onCheckboxUnchecked": {
			setEventProp(frame, FRAMEEVENT_CHECKBOX_UNCHECKED, val, _oldValue);
			break;
		}
		case "onEditboxTextChanged": {
			setEventProp(
				frame,
				FRAMEEVENT_EDITBOX_TEXT_CHANGED,
				val,
				_oldValue,
			);
			break;
		}
		case "onPopupmenuItemChanged": {
			setEventProp(
				frame,
				FRAMEEVENT_POPUPMENU_ITEM_CHANGED,
				val,
				_oldValue,
			);
			break;
		}
		case "onDoubleClick": {
			setEventProp(frame, FRAMEEVENT_MOUSE_DOUBLECLICK, val, _oldValue);
			break;
		}
		case "onSpriteAnimUpdate": {
			setEventProp(frame, FRAMEEVENT_SPRITE_ANIM_UPDATE, val, _oldValue);
			break;
		}
		case "onSliderChanged": {
			setEventProp(
				frame,
				FRAMEEVENT_SLIDER_VALUE_CHANGED,
				val,
				_oldValue,
			);
			break;
		}
		case "onDialogCancel": {
			setEventProp(frame, FRAMEEVENT_DIALOG_CANCEL, val, _oldValue);
			break;
		}
		case "onDialogAccept": {
			setEventProp(frame, FRAMEEVENT_DIALOG_ACCEPT, val, _oldValue);
			break;
		}
		case "onEditboxEnter": {
			setEventProp(frame, FRAMEEVENT_EDITBOX_ENTER, val, _oldValue);
			break;
		}
		case "ref": {
			if (val) val.current = frame;
			break;
		}
		case "name":
		case "priority":
		case "isSimple":
		case "typeName":
		case "inherits":
		case "children":
		case "context":
		case "key":
		case "parentFrame":
		case "onLoad":
			break;
		default:
			absurd(prop);
	}
};

const typeNames = [
	"backdrop",
	"button",
	"chatdisplay",
	"checkbox",
	"control",
	"dialog",
	"editbox",
	"gluebutton",
	"gluecheckbox",
	"glueeditbox",
	"gluepopupmenu",
	"gluetextbutton",
	"highlight",
	"listbox",
	"menu",
	"model",
	"popupmenu",
	"scrollbar",
	"slashchatbox",
	"slider",
	"sprite",
	"text",
	"textarea",
	"textbutton",
	"timertext",
];

const simpleTypeNames = [
	"simple-button",
	"simple-checkbox",
	"simple-statusbar",
];

let updateScheduled = false;
const schedulingTimer = CreateTimer();

export const adapter: Adapter<framehandle> = {
	createFrame: (
		jsxType: string,
		_parentFrame: framehandle | undefined,
		props: FrameProps,
	) => {
		const parentFrame = props.parentFrame || _parentFrame;

		if (!parentFrame) throw `expected parent frame for ${jsxType}`;

		const {
			name = frameDefaults.name,
			priority = frameDefaults.priority,
			inherits,
			isSimple,
			context = frameDefaults.context,
			ref,
		} = props;

		let typeName = props.typeName;

		if (typeName == null && typeNames.includes(jsxType))
			typeName = jsxType.toUpperCase();

		if (typeName == null && simpleTypeNames.includes(jsxType))
			typeName = jsxType.replace("-", "").toUpperCase();

		// frame is both our base component and a typeName; we expose it as
		// container
		if (typeName == null && jsxType === "container") typeName = "FRAME";
		if (typeName == null && jsxType === "simple-container")
			typeName = "SIMPLEFRAME";

		let frame: framehandle;

		if (isSimple ?? jsxType === "simple-frame")
			frame = BlzCreateSimpleFrame(name, parentFrame, context);
		else if (typeName)
			frame = BlzCreateFrameByType(
				typeName,
				name,
				parentFrame,
				inherits ?? "",
				context,
			);
		else frame = BlzCreateFrame(name, parentFrame, priority, context);

		if (ref) ref.current = frame;

		props.onLoad && props.onLoad(frame);

		return frame;
	},

	cleanupFrame: (frame: framehandle): void => {
		BlzDestroyFrame(frame);
		const existingTooltip = tooltipMap.get(frame);
		if (existingTooltip) adapter.cleanupFrame(existingTooltip);
	},

	updateFrameProperties: (
		frame: framehandle,
		prevProps: FrameProps,
		nextProps: FrameProps,
	) => {
		let prop: keyof FrameProps;

		// Clear removed props
		for (prop in prevProps)
			if (!(prop in nextProps))
				try {
					setProp(frame, prop);
				} catch (err) {
					print(err);
				}

		// Add new props
		for (prop in nextProps)
			if (nextProps[prop] !== prevProps[prop])
				try {
					setProp(frame, prop, nextProps[prop], prevProps[prop]);
				} catch (err) {
					print(err);
				}
	},

	getParent: (frame: framehandle): framehandle => BlzFrameGetParent(frame),

	scheduleUpdate: () => {
		if (updateScheduled) return;
		updateScheduled = true;
		TimerStart(schedulingTimer, 0, false, () => {
			updateScheduled = false;
			flushUpdates();
		});
	},
};
