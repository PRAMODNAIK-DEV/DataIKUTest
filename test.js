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

function usePrevious(value: any) {
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
    const [openToast, setOpenToast] = useState<boolean>(false);
    const [childProperties, setChildProperties] = useState({});
    const [toastInfo, setToastInfo] = useState({
        message: "",
        severity: TOAST_TYPE.SUCCESS,
    });
    const [localAgentDetail, setLocalAgentDetail] = useState(agentDetail);
    const [browserFields] = useState<string[]>(ignoreFields);
    const [formData2, setFormData2] = useState<any>({});
    const [keyName, setKeyName] = useState<string>("");

    const [formData, setFormData] = useState<any>(() => {
        if (Object.keys(defaultSelectedParameters).length > 0) {
            return defaultSelectedParameters;
        }

        const initialState: any = {};
        const allFields = (localAgentDetail?.skills_config || []).flatMap(
            (skill: any) => Object.entries(skill.input_schema?.properties || {})
        );

        allFields.forEach(([key, value]: any) => {
            if (!browserFields.includes(key)) {
                initialState[key] = value.default === "None" ? "" : value.default || "";
            }
        });

        // Always include model and system_prompt from agentDetail initially
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
    
    // START OF FIX: This is the new, consolidated logic for isSubmitDisabled.
    const isSubmitDisabled = useMemo(() => {
        const requiredFields = new Set<string>();

        // 1. Collect all static required fields from all skills
        (localAgentDetail?.skills_config || []).forEach(skill => {
            (skill.input_schema?.required || []).forEach((key: string) => {
                if (!browserFields.includes(key)) {
                    requiredFields.add(key);
                }
            });
        });

        // 2. Collect all dynamic required fields by finding them via `$ref`
        Object.entries(combinedProperties).forEach(([, data]: any) => {
            if (data?.$ref || data?.anyOf?.[0]?.$ref) {
                const reference = data?.$ref || data?.anyOf?.[0]?.$ref;
                const referenceKeys = reference.replace("#/", "").split("/");
                
                // Consolidate all $defs from all skills into a single object for easier lookup
                const allDefs = localAgentDetail.skills_config?.reduce((acc: any, skill: any) => ({
                    ...acc,
                    ...(skill.input_schema?.$defs || {})
                }), {});
                
                const def = allDefs?.[referenceKeys[1]];
                
                if (def) {
                    (def.required || []).forEach((dynamicKey: string) => {
                        if (!browserFields.includes(dynamicKey)) {
                            requiredFields.add(dynamicKey);
                        }
                    });
                }
            }
        });

        // 3. Check if any of the collected required fields are empty in the form data
        return [...requiredFields].some((fieldKey) => {
            const value = formData?.[fieldKey] ?? formData?.query_params?.[fieldKey];
            const fieldSchema = combinedProperties?.[fieldKey];

            // If the field has a default of null or its type is null, it's not truly required.
            if (fieldSchema?.default === null || fieldSchema?.anyOf?.[0]?.type === 'null') {
                return false;
            }

            // Helper function to check for empty values
            const isEmpty = (val: any) => {
                if (val === undefined || val === null || val === "") return true;
                if (Array.isArray(val) && val.length === 0) return true;
                if (typeof val === "object" && Object.keys(val).length === 0) return true;
                return false;
            };

            return isEmpty(value);
        });
    }, [formData, localAgentDetail, browserFields, combinedProperties]);
    // END OF FIX

    // useEffects for initialization and reset
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
            const initialState: any = {};
            const allFields = (localAgentDetail?.skills_config || []).flatMap(
                (skill: any) => Object.entries(skill.input_schema?.properties || {})
            );

            allFields.forEach(([key, value]: any) => {
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
    }, [resetFormTrigger, localAgentDetail?.agent_id, browserFields]);

    // Handlers and helper functions
    const updateDefaultsInSkillsConfig = (
        agentDetailtemp: any,
        defaultParams: any
    ) => {
        const skills = agentDetailtemp.skills_config;
        if (!skills || !Array.isArray(skills)) return agentDetailtemp;

        for (const skill of skills) {
            const inputSchema = skill.input_schema;
            const queryParams = defaultParams.query_params;

            if (!inputSchema?.$defs || !queryParams) continue;

            const queryParamKeys = Object.keys(queryParams);
            let bestMatchKey = "";
            let maxMatches = 0;

            for (const [key, schema] of Object.entries<any>(inputSchema.$defs)) {
                const schemaKeys = Object.keys(schema.properties || {});
                const matches = schemaKeys.filter((k) =>
                    queryParamKeys.includes(k)
                ).length;

                if (matches > maxMatches) {
                    bestMatchKey = key;
                    maxMatches = matches;
                }
            }

            if (!bestMatchKey) continue;

            const matchedSchema = inputSchema.$defs[bestMatchKey];
            for (const [key, value] of Object.entries(queryParams)) {
                if (matchedSchema.properties?.[key]) {
                    matchedSchema.properties[key].default = value;
                }
            }
            inputSchema.$defs[bestMatchKey] = matchedSchema;
            skill.input_schema = inputSchema;
        }
        return agentDetailtemp;
    };

    const handleDynamicFieldChange = (
        fieldKey: string,
        value: any,
        key: string
    ) => {
        setFormData2((prevState: any) => {
            const updatedFormData = {
                ...prevState,
                [fieldKey]: value,
            };
            setFormData((oldState: any) => ({
                ...oldState,
                [key]: updatedFormData,
            }));
            return updatedFormData;
        });
    };

    const closePrompt = () => {
        handleCloseAgent();
    };

    const mockupUpdate = (query: string) => {
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

    const handleInputChange = useCallback((key: string, value: any) => {
        setFormData((prevState: any) => {
            const updatedFormData = { ...prevState, [key]: value };
            return updatedFormData;
        });
    }, []);

    const renderSkillSections = () => {
        if (!localAgentDetail?.skills_config?.length) {
            return (
                <h5 className="error-message-container">{failedCondition}</h5>
            );
        }

        return localAgentDetail.skills_config && localAgentDetail.skills_config.map((skill: any, skillIndex: number) => {
            const skillName = skill.name || `Skill ${skillIndex + 1}`;
            const skillProperties = Object.entries(skill.input_schema?.properties || {});
            const skillRequired = skill.input_schema?.required || [];
            // Filter properties to exclude browser-specific fields and special cases like query_params
            const filteredProperties = skillProperties.filter(([key]) => {
                return !browserFields.includes(key) && key !== "query_params";
            });
            // Extract and render dynamic fields for this specific skill
            const dynamicRefs = skillProperties.filter(([, value]: any) => value?.$ref || value?.anyOf?.[0]?.$ref);
            const skillDynamicFields: { [key: string]: any } = {};

            dynamicRefs.forEach(([, value]: any) => {
                const reference = value?.$ref || value?.anyOf?.[0]?.$ref;
                const referenceKeys = reference.replace("#/", "").split("/");
                const def = skill.input_schema?.$defs?.[referenceKeys[1]];
                if (def) {
                    Object.entries(def.properties || {}).forEach(([dynamicKey, dynamicValue]: any) => {
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
            // Sort the fields to prioritize required ones
            allSkillFields.sort(([keyA, fieldA]: any, [keyB, fieldB]: any) => {
                const isRequiredA = skillRequired.includes(keyA) || fieldA.required;
                const isRequiredB = skillRequired.includes(keyB) || fieldB.required;

                if (isRequiredA && !isRequiredB) {
                    return -1; // 'A' comes first
                }
                if (!isRequiredA && isRequiredB) {
                    return 1; // 'B' comes first
                }
                return 0; // Maintain original order if neither is required
            });
            return (
                <div key={skillName} style={{ marginBottom: '20px' }}>
                    <Typography variant="h6" className="skill-section-title">
                        {skillName}
                    </Typography>
                    <Grid container spacing={2} className="skill-form-grid">
                        {allSkillFields.map(([fieldKey, widget]: any) => (
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
