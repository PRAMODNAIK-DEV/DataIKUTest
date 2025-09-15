import CloseIcon from "@mui/icons-material/Close";
import {
    Box,
    Grid,
    IconButton,
    Modal,
    ThemeProvider,
    Typography,
} from "@mui/material";
import Button from "@mui/material/Button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultIgnoreFields } from "../../helpers/constants/agentFormMockData";
import { PromptContext } from "../../helpers/contexts/promptLibraryContext";
import { agentFormInputModalProps } from "../../helpers/interfaces/AgentFormInput";
import Theme from "../../styles/muiTheme-frontdoor";
import CommonComponents from "../common/AgentFormFields/CommonComponents";
import DotAnimation from "../common/DotAnimation/DotAnimation";
import GlobalLoader from "../common/GlobalLoader";
import ToastMessage, { TOAST_TYPE } from "../common/ToastMessage/ToastMessage";
import "./AgentFormInputModal.scss";
import Loader from "../common/Loader/Loader";

function usePrevious(value) {
    const ref = useRef();
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
}

const AgentFormInputModal = ({
    openAgent = false,
    agentDetail,
    handleCloseAgent,
    onSubmitCallBack = (selected, mockupUpdate) => { },
    ignoreFields = defaultIgnoreFields,
    title = null,
    showComplexFields = false,
    chipData,
    loading = false,
    resetFormTrigger,
    failedCondition = "Agent does not have any configuration.",
    defaultSelectedParameters = {},
}: agentFormInputModalProps) => {
    // START: HOOKS AND STATE DECLARATIONS
    const [isLoading, setLoading] = useState(false);
    const [openToast, setOpenToast] = useState(false);
    const [childProperties, setChildProperties] = useState({});
    const [toastInfo, setToastInfo] = useState({
        message: "",
        severity: TOAST_TYPE.SUCCESS,
    });
    const [localAgentDetail, setLocalAgentDetail] = useState(agentDetail);
    const [browserFields, setBrowserFields] = useState(ignoreFields);
    const [formData2, setFormData2] = useState({});
    const [keyName, setKeyName] = useState("");

    const [formData, setFormData] = useState(() => {
        if (Object.keys(defaultSelectedParameters).length > 0) {
            return defaultSelectedParameters;
        }

        const initialState = {};
        const allFields = (localAgentDetail?.skills_config || []).flatMap(
            (skill) => Object.entries(skill.input_schema?.properties || {})
        );

        allFields.forEach(([key, value]) => {
            if (!browserFields.includes(key)) {
                initialState[key] = value.default === "None" ? "" : value.default || "";
            }
        });

        initialState.model = localAgentDetail?.model || "";
        initialState.agent_system_prompt = localAgentDetail?.system_prompt || "";

        return initialState;
    });
    // END: HOOKS AND STATE DECLARATIONS

    const combinedProperties = useMemo(() => {
        return (localAgentDetail?.skills_config || []).reduce(
            (acc, skill) => ({
                ...acc,
                ...(skill.input_schema?.properties || {}),
            }),
            {}
        );
    }, [localAgentDetail]);

    // START: CORRECTED isSubmitDisabled LOGIC
    const isSubmitDisabled = useMemo(() => {
        const requiredFields = new Set();

        (localAgentDetail?.skills_config || []).forEach(skill => {
            (skill.input_schema?.required || []).forEach(key => {
                if (!browserFields.includes(key)) {
                    requiredFields.add(key);
                }
            });
        });

        Object.entries(combinedProperties).forEach(([key, data]) => {
            if (data?.$ref || data?.anyOf?.[0]?.$ref) {
                const reference = data?.$ref || data?.anyOf?.[0]?.$ref;
                const referenceKeys = reference.replace("#/", "").split("/");
                const defs = localAgentDetail?.skills_config?.reduce((acc, skill) => ({...acc, ...(skill.input_schema?.$defs || {})}), {});
                const def = defs?.[referenceKeys[1]];
                
                if (def) {
                    (def.required || []).forEach(dynamicKey => {
                        if (!browserFields.includes(dynamicKey)) {
                            requiredFields.add(dynamicKey);
                        }
                    });
                }
            }
        });

        // Special case: `model` is always required
        if (localAgentDetail?.model) {
            requiredFields.add('model');
        }

        return [...requiredFields].some(fieldKey => {
            const value = formData?.[fieldKey] ?? formData?.query_params?.[fieldKey];
            
            const isEmpty = (val) => {
                if (val === undefined || val === null || val === "") return true;
                if (Array.isArray(val) && val.length === 0) return true;
                if (typeof val === "object" && Object.keys(val).length === 0) return true;
                return false;
            };

            return isEmpty(value);
        });
    }, [formData, localAgentDetail, browserFields, combinedProperties]);
    // END: CORRECTED isSubmitDisabled LOGIC
    
    // START: EFFECT HOOKS
    useEffect(() => {
        setLoading(!localAgentDetail?.agent_id && openAgent);
    }, [localAgentDetail, openAgent]);

    useEffect(() => {
        if (
            defaultSelectedParameters &&
            Object.keys(defaultSelectedParameters).length > 0
        ) {
            const updated = updateDefaultsInSkillsConfig(
                agentDetail,
                defaultSelectedParameters
            );
            setLocalAgentDetail(updated);
        } else {
            setLocalAgentDetail(agentDetail);
        }
    }, [agentDetail, defaultSelectedParameters]);

    useEffect(() => {
        if (resetFormTrigger !== undefined) {
            const initialState = {};
            const allFields = (localAgentDetail?.skills_config || []).flatMap(
                (skill) => Object.entries(skill.input_schema?.properties || {})
            );

            allFields.forEach(([key, value]) => {
                if (!browserFields.includes(key)) {
                    initialState[key] =
                        value.default === "None" ? "" : value.default || "";
                }
            });

            initialState.model = localAgentDetail?.model || "";
            initialState.agent_system_prompt = localAgentDetail?.system_prompt || "";

            setFormData(initialState);
            setFormData2({});
        }
    }, [resetFormTrigger, localAgentDetail?.agent_id]);
    // END: EFFECT HOOKS

    // ... (rest of your component code, including handlers and JSX)

    const handleDynamicFieldChange = (
        fieldKey,
        value,
        key
    ) => {
        setFormData2((prevState) => {
            const updatedFormData = {
                ...prevState,
                [fieldKey]: value,
            };
            setFormData((oldState) => ({
                ...oldState,
                [key]: updatedFormData,
            }));
            return updatedFormData;
        });
    };

    const closePrompt = () => {
        handleCloseAgent();
    };

    const mockupUpdate = (query) => {
        if (combinedProperties.query) {
            formData["query"] = query;
        } else if (combinedProperties.user_query) {
            formData["user_query"] = query;
        }
        if (Object.keys(childProperties).length > 0) {
            Object.entries(childProperties).map(([key, value]) => {
                if (Object.keys(value).includes("query")) {
                    formData[key].query = query;
                } else if (Object.keys(value).includes("user_query")) {
                    formData[key].user_query = query;
                }
            });
        }
        return formData;
    };

    const chooseHandle = () => {
        let finalFormData = { ...formData };
        onSubmitCallBack(finalFormData, mockupUpdate);
    };

    const handleInputChange = useCallback((key, value) => {
        setFormData((prevState) => ({ ...prevState, [key]: value }));
    }, []);

    const renderSkillSections = () => {
        if (!localAgentDetail?.skills_config?.length) {
            return (
                <h5 className="error-message-container">{failedCondition}</h5>
            );
        }

        return localAgentDetail.skills_config && localAgentDetail.skills_config.map((skill, skillIndex) => {
            const skillName = skill.name || `Skill ${skillIndex + 1}`;
            const skillProperties = Object.entries(skill.input_schema?.properties || {});
            const skillRequired = skill.input_schema?.required || [];
            const filteredProperties = skillProperties.filter(([key]) => {
                return !browserFields.includes(key) && key !== "query_params";
            });
            const dynamicRefs = skillProperties.filter(([, value]) => value?.$ref || value?.anyOf?.[0]?.$ref);
            const skillDynamicFields = {};

            dynamicRefs.forEach(([fieldKey, value]) => {
                const reference = value?.$ref || value?.anyOf?.[0]?.$ref;
                const referenceKeys = reference.replace("#/", "").split("/");
                const def = skill.input_schema?.$defs?.[referenceKeys[1]];
                if (def) {
                    Object.entries(def.properties || {}).forEach(([dynamicKey, dynamicValue]) => {
                        if (!browserFields.includes(dynamicKey)) {
                            skillDynamicFields[dynamicKey] = {
                                ...dynamicValue,
                                required: (def.required || []).includes(dynamicKey)
                            };
                        }
                    });
                }
            });
            const allSkillFields = [
                ...filteredProperties,
                ...Object.entries(skillDynamicFields)
            ];
            allSkillFields.sort(([keyA, fieldA], [keyB, fieldB]) => {
                const isRequiredA = skillRequired.includes(keyA) || fieldA.required;
                const isRequiredB = skillRequired.includes(keyB) || fieldB.required;

                if (isRequiredA && !isRequiredB) {
                    return -1;
                }
                if (!isRequiredA && isRequiredB) {
                    return 1;
                }
                return 0;
            });
            return (
                <div key={skillName} style={{ marginBottom: '20px' }}>
                    <Typography variant="h6" className="skill-section-title">
                        {skillName}
                    </Typography>
                    <Grid container spacing={2} className="skill-form-grid">
                        {allSkillFields.map(([fieldKey, widget]) => (
                            <Grid
                                item xs={12} md={6} sm={12} lg={6} xl={4}
                                className="grid-padding"
                                key={`${skillName}-${fieldKey}`}
                            >
                                <CommonComponents
                                    fieldKey={fieldKey}
                                    datavlaue={widget}
                                    handleInputChange={handleInputChange}
                                    formData={formData}
                                    agentDetail={localAgentDetail}
                                    browserFields={browserFields}
                                    isRequiredField={skillRequired.includes(fieldKey) || widget.required}
                                    chipData={chipData}
                                />
                            </Grid>
                        ))}
                    </Grid>
                </div>
            );
        });
    };

    return (
        <ThemeProvider theme={Theme}>
            <GlobalLoader open={isLoading} />
            <Modal
                className="modal-cstm-container"
                open={openAgent}
                onClose={closePrompt}
                aria-labelledby="modal-modal-title"
                aria-describedby="modal-modal-description"
                style={{ zIndex: 900 }}
            >
                <>
                    <ToastMessage
                        severity={toastInfo.severity}
                        isVisible={openToast}
                        hideToast={setOpenToast}
                        message={toastInfo.message}
                    />
                    <Box className="modal-cstm-box">
                        <PromptContext.Provider value={{ isLoading, setLoading }}>
                            <Grid container spacing={0} className="model-header">
                                <Grid item xs={10} md={10}>
                                    <Typography className="modalTitle" variant="h6">
                                        <div className="Agent-name">
                                            {title || localAgentDetail?.name}
                                            {!localAgentDetail?.name && <DotAnimation />}
                                        </div>
                                    </Typography>
                                </Grid>
                                <Grid item xs={2} md={2}>
                                    <div className="closebtn-parent">
                                        <IconButton
                                            onClick={closePrompt}
                                            className="modalclose-cstm"
                                        >
                                            <CloseIcon />
                                        </IconButton>
                                    </div>
                                </Grid>
                            </Grid>
                            {!loading ? (
                                <Grid container spacing={0} className="agent-container">
                                    <div style={{ padding: '0 16px', marginBottom: '20px', width: '100%' }}>
                                        <Typography variant="h6" className="skill-section-title">
                                            Agent Configuration
                                        </Typography>
                                        <Grid container spacing={2}>
                                            <Grid item xs={12} md={6} sm={12} lg={6} xl={4} className="grid-padding">
                                                <CommonComponents
                                                    fieldKey="model"
                                                    datavlaue={{ title: "Model", type: "string" }}
                                                    handleInputChange={handleInputChange}
                                                    formData={formData}
                                                    agentDetail={localAgentDetail}
                                                    browserFields={browserFields}
                                                    isRequiredField={true}
                                                    chipData={chipData}
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={6} sm={12} lg={6} xl={4} className="grid-padding">
                                                <CommonComponents
                                                    fieldKey="agent_system_prompt"
                                                    datavlaue={{ title: "System Prompt", type: "string", format: "text-area" }}
                                                    handleInputChange={handleInputChange}
                                                    formData={formData}
                                                    agentDetail={localAgentDetail}
                                                    browserFields={browserFields}
                                                    isRequiredField={false}
                                                    chipData={chipData}
                                                />
                                            </Grid>
                                        </Grid>
                                    </div>
                                    {renderSkillSections()}
                                </Grid>
                            ) : (
                                <div className="loader-center add-height">
                                    <Loader isLoading={loading} />
                                </div>
                            )}
                            <div className="tw-flex tw-flex-row tw-justify-center tw-items-center choose-cancel-button">
                                <div className="tw-w-4/4 tw-mr-2 tw-flex">
                                    <div className="tw-mr-right tw-mr-[20px]">
                                        <Button
                                            variant="contained"
                                            onClick={closePrompt}
                                            className="tw-w-full tw-flex tw-flex-row tw-w-[140px] tw-justify-end tw-items-center tw-cursor-pointer cancel-button"
                                        >
                                            <span>Cancel</span>
                                        </Button>
                                    </div>
                                    <div>
                                        <Button
                                            disabled={isSubmitDisabled}
                                            variant="contained"
                                            onClick={chooseHandle}
                                            className={
                                                !isSubmitDisabled
                                                    ? "tw-w-full tw-flex tw-flex-row tw-w-[140px] tw-justify-end tw-items-center tw-cursor-pointer choose-button"
                                                    : "tw-w-full tw-flex tw-flex-row tw-w-[140px] tw-justify-end tw-items-center tw-cursor-pointer choose-button disabled-select-button"
                                            }
                                        >
                                            <span>Submit</span>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </PromptContext.Provider>
                    </Box>
                </>
            </Modal>
        </ThemeProvider>
    );
};

export default AgentFormInputModal;
